import os
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, flash
from pymongo import MongoClient
from bson.objectid import ObjectId
from flask_bcrypt import Bcrypt
from datetime import datetime
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
import certifi
import cloudinary
import cloudinary.uploader
from bardapi import Bard

load_dotenv(dotenv_path='.env.public')
load_dotenv(dotenv_path='.env.private')


app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY')

bard_session_id = os.getenv('BARD_SESSION_ID')
bard_chatbot = None
if bard_session_id:
    try:
        bard_chatbot = Bard(token=bard_session_id)
        print("✅ BardAPI Chatbot configured successfully.")
    except Exception as e:
        print(f"❌ Error configuring BardAPI: {e}")
else:
    print("⚠️ BARD_SESSION_ID not found in .env. Chatbot will be disabled.")

MONGO_URI = os.getenv('MONGO_URI')
if not MONGO_URI:
    raise RuntimeError("MONGO_URI not set in .env file")

client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
db = client.get_database('fir_filing_db')
users_collection = db.users
admins_collection = db.admins
firs_collection = db.firs
officers_collection = db.officers

bcrypt = Bcrypt(app)

cloudinary.config(
    cloud_name=os.getenv('CLOUDINARY_CLOUD_NAME'),
    api_key=os.getenv('CLOUDINARY_API_KEY'),
    api_secret=os.getenv('CLOUDINARY_API_SECRET')
)

def sync_admins_from_env():
    print("Synchronizing admin data from .env file...")
    try:
        admin_count = int(os.getenv('ADMIN_COUNT', 0))
    except (ValueError, TypeError):
        print("Warning: ADMIN_COUNT in .env is not a valid number. No sync will occur.")
        return

    if admin_count == 0:
        print("Warning: ADMIN_COUNT is 0 or not found in .env. No admins will be created.")
        return

    for i in range(1, admin_count + 1):
        admin_id = os.getenv(f'ADMIN_{i}_ID')
        password = os.getenv(f'ADMIN_{i}_PASS')
        station_name = os.getenv(f'ADMIN_{i}_STATION')

        if not all([admin_id, password, station_name]):
            print(f"Warning: Missing full details for ADMIN_{i}. Skipping this record.")
            continue

        existing_admin = admins_collection.find_one({"admin_id": admin_id})

        if existing_admin:
            if existing_admin.get('station_name') != station_name or not bcrypt.check_password_hash(existing_admin['password'], password):
                hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
                admins_collection.update_one(
                    {"admin_id": admin_id},
                    {"$set": {
                        "password": hashed_password,
                        "station_name": station_name
                    }}
                )
                print(f"Updated details for admin: {admin_id}")
        else:
            hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
            admin_doc = {
                "admin_id": admin_id,
                "password": hashed_password,
                "station_name": station_name
            }
            admins_collection.insert_one(admin_doc)
            print(f"Created new admin: {admin_id}")

    print("Admin synchronization complete.")

# --- NEW FUNCTION TO ADD OFFICERS ---
def sync_officers_from_env():
    """
    Reads admin data from .env file and creates 5 police officers
    for each police station, if they don't already exist.
    """
    print("Synchronizing officer data...")
    try:
        admin_count = int(os.getenv('ADMIN_COUNT', 0))
    except (ValueError, TypeError):
        print("Warning: ADMIN_COUNT in .env is not a valid number. Officer sync will be skipped.")
        return

    if admin_count == 0:
        print("Warning: ADMIN_COUNT is 0. No officers will be created.")
        return

    for i in range(1, admin_count + 1):
        admin_id = os.getenv(f'ADMIN_{i}_ID')
        station_name = os.getenv(f'ADMIN_{i}_STATION')

        if not admin_id or not station_name:
            print(f"Warning: Missing ID or Station for ADMIN_{i}. Skipping officer creation for this station.")
            continue
        
        # Generate a badge prefix from the admin ID, e.g., PSTOSHAM01 -> TOSHAM
        badge_prefix = admin_id.replace("PS", "")
        badge_prefix = ''.join([char for char in badge_prefix if not char.isdigit()])

        for j in range(1, 6):  # Create 5 officers per station
            station_short_name = station_name.split(',')[0]
            officer_name = f"{station_short_name} Officer {j}"
            badge_id = f"{badge_prefix}{j:02}"  # e.g., TOSHAM01, TOSHAM02

            existing_officer = officers_collection.find_one({"badge_id": badge_id})

            if not existing_officer:
                officer_doc = {
                    'name': officer_name,
                    'badge_id': badge_id,
                    'station_name': station_name,
                    'is_active': True,
                    'created_at': datetime.utcnow()
                }
                officers_collection.insert_one(officer_doc)
                print(f"Created officer: {officer_name} ({badge_id}) for {station_name}")
# --- END OF NEW FUNCTION ---

@app.route('/')
def login_page():
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        data = request.json
        username = data.get('username')
        password = data.get('password')
        phone = data.get('phone')
        email = data.get('email')

        if not username or not password or not phone:
            return jsonify({'error': 'Username, password, and phone number are required'}), 400

        if users_collection.find_one({'username': username}):
            return jsonify({'error': 'Username already exists'}), 409

        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')

        users_collection.insert_one({
            'username': username,
            'password': hashed_password,
            'phone': phone,
            'email': email,
            'created_at': datetime.utcnow()
        })

        return jsonify({'message': 'Registration successful! Please login.'}), 201

    return render_template('register.html')


@app.route('/user_login', methods=['POST'])
def user_login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400

    user = users_collection.find_one({'username': username})

    if user and bcrypt.check_password_hash(user['password'], password):
        session['username'] = user['username']
        session['role'] = 'user'
        return jsonify({'message': 'Login successful', 'redirect': url_for('user_dashboard')})
    else:
        return jsonify({'error': 'Invalid username or password'}), 401


@app.route('/admin_login', methods=['POST'])
def admin_login():
    data = request.json
    admin_id = data.get("admin_id")
    password = data.get("password")

    admin = admins_collection.find_one({"admin_id": admin_id})

    if admin and bcrypt.check_password_hash(admin['password'], password):
        session['role'] = 'admin'
        session['admin_id'] = admin['admin_id']
        session['station_name'] = admin.get('station_name', 'Admin')
        return jsonify({"message": "Admin login successful!", "redirect": url_for('admin_dashboard')})

    return jsonify({"message": "Invalid Admin ID or Password!"}), 401


@app.route("/admin_dashboard")
def admin_dashboard():
    if session.get('role') == 'admin':
        station_name = session.get('station_name')
        if not station_name:
            return render_template('admin_dashboard.html', firs=[], station_name="Unknown")

        station_firs = list(firs_collection.find(
            {'police_station': station_name}
        ).sort("filed_date", -1))

        return render_template('admin_dashboard.html', firs=station_firs, station_name=station_name)

    return redirect(url_for('login_page'))

@app.route("/admin/manage_officers")
def manage_officers():
    if session.get('role') != 'admin':
        return redirect(url_for('login_page'))

    station_name = session.get('station_name')
    if not station_name:
        flash("Admin session error: station not found.", "error")
        return redirect(url_for('admin_dashboard'))

    station_firs = list(firs_collection.find({
        'police_station': station_name,
        'fir_status': {'$in': ['Pending', 'Under Investigation']}
    }).sort("filed_date", -1))

    station_officers = list(officers_collection.find(
        {'station_name': station_name, 'is_active': True}
    ).sort("name", 1))

    return render_template('manage_officers.html',
                           firs=station_firs,
                           station_officers=station_officers,
                           station_name=station_name)


@app.route('/admin/assign_officer', methods=['POST'])
def assign_officer():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        fir_id_str = request.form.get('fir_id')
        officer_badge_id = request.form.get('officer_id')

        if not fir_id_str or not officer_badge_id:
            flash('Missing FIR ID or Officer ID.', 'danger')
            return redirect(url_for('manage_officers'))

        fir_id = ObjectId(fir_id_str)

        officer = officers_collection.find_one({'badge_id': officer_badge_id, 'station_name': session.get('station_name')})
        if not officer:
            flash(f'Officer with Badge ID {officer_badge_id} not found.', 'danger')
            return redirect(url_for('manage_officers'))

        firs_collection.update_one(
            {'_id': fir_id},
            {'$set': {
                'assigned_officer_id': officer_badge_id,
                'assigned_officer_name': officer.get('name', officer_badge_id),
                'fir_status': 'Under Investigation'
            }}
        )

        flash(f"Successfully assigned Officer {officer.get('name')} to FIR {fir_id_str}.", 'success')

    except Exception as e:
        print(f"Error assigning officer: {e}")
        flash('An error occurred during the assignment process.', 'danger')

    return redirect(url_for('manage_officers'))

@app.route("/admin/analytics")
def admin_analytics():
    if session.get('role') != 'admin':
        return redirect(url_for('login_page'))

    station_name = session.get('station_name', 'Unknown Station')
    return render_template('analytics.html', station_name=station_name)


@app.route("/admin/analytics_data")
def analytics_data():
    if session.get('role') != 'admin':
        return jsonify({"error": "Unauthorized"}), 401

    station_name = session.get('station_name')
    if not station_name:
        return jsonify({"error": "Admin station not found in session"}), 400

    try:
        pipeline = [
            {
                '$match': { 'police_station': station_name }
            },
            {
                '$group': {
                    '_id': '$category',
                    'count': { '$sum': 1 }
                }
            },
            {
                '$sort': { 'count': -1 }
            }
        ]

        results = list(firs_collection.aggregate(pipeline))

        data_for_chart = {item['_id']: item['count'] for item in results}

        return jsonify(data_for_chart)

    except Exception as e:
        print(f"Error generating analytics data: {e}")
        return jsonify({"error": "Could not generate analytics data"}), 500


@app.route('/admin/settings/officers', methods=['GET'])
def get_station_officers():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    station_name = session.get('station_name')
    if not station_name:
        return jsonify({'error': 'Admin station not found'}), 400

    station_officers = list(officers_collection.find(
        {'station_name': station_name},
        {'_id': 0}
    ).sort("name", 1))
    
    return jsonify(station_officers)


@app.route('/admin/settings/officers/add', methods=['POST'])
def add_station_officer():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    station_name = session.get('station_name')
    if not station_name:
        return jsonify({'error': 'Admin station not found'}), 400

    data = request.json
    officer_name = data.get('name')
    badge_id = data.get('badge_id')

    if not officer_name or not badge_id:
        return jsonify({'error': 'Officer name and badge ID are required.'}), 400

    if officers_collection.find_one({'badge_id': badge_id, 'station_name': station_name}):
        return jsonify({'error': f'An officer with badge ID {badge_id} already exists.'}), 409

    officer_doc = {
        'name': officer_name,
        'badge_id': badge_id,
        'station_name': station_name,
        'is_active': True,
        'created_at': datetime.utcnow()
    }
    officers_collection.insert_one(officer_doc)
    
    return jsonify({'message': f'Officer {officer_name} added successfully.'}), 201

@app.route("/user_dashboard")
def user_dashboard():
    if session.get('role') == 'user' and session.get('username'):
        username = session['username']
        user_firs = list(firs_collection.find({'username': username}).sort("filed_date", -1))
        return render_template('user_dashboard.html', user={'username': username}, firs=user_firs)
    return redirect(url_for('login_page'))


@app.route('/submit_fir', methods=['POST'])
def submit_fir():
    if session.get('role') != 'user' or 'username' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        documents = request.files.getlist('file-upload')
        saved_documents_data = []
        for doc in documents:
            if doc and doc.filename:
                doc_data = upload_file_to_cloudinary(doc)
                if doc_data:
                    saved_documents_data.append(doc_data)

        incident_date_str = request.form['incident-date']
        
        accused_names = request.form.getlist('accused_names[]')

        new_fir = {
            "username": session['username'],
            "user_name": request.form['user-name'],
            "state": request.form['state'],
            "district": request.form['district'],
            "user_address": request.form['user-address'],
            "mobile": request.form['mobile'],
            "category": request.form['category'],
            "other_category": request.form.get('other-category-input', ''),
            "accused_names": accused_names,
            "incident_date": datetime.strptime(incident_date_str, '%Y-%m-%dT%H:%M'),
            "location": request.form['location'],
            "police_station": request.form['police-station'],
            "description": request.form['description'],
            "supporting_documents": saved_documents_data,
            "fir_status": "Pending",
            "filed_date": datetime.utcnow(),
            "assigned_officer_id": None,
            "assigned_officer_name": "Unassigned"
        }

        firs_collection.insert_one(new_fir)
        return jsonify({'message': 'FIR submitted successfully!'}), 201

    except Exception as e:
        print(f"Error submitting FIR: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/admin/update_fir_status', methods=['POST'])
def update_fir_status():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.json
    try:
        fir_id = ObjectId(data.get('fir_id'))
        new_status = data.get('status')

        result = firs_collection.update_one(
            {'_id': fir_id},
            {'$set': {'fir_status': new_status}}
        )
        if result.matched_count == 0:
            return jsonify({'error': 'FIR not found'}), 404

        return jsonify({'message': 'FIR status updated successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Successfully logged out!", "redirect": url_for('login_page')})


@app.route('/api/police_stations')
def get_police_stations():
    try:
        stations_cursor = admins_collection.find({}, {'station_name': 1, '_id': 0})
        stations_by_district = {}

        for station_doc in stations_cursor:
            full_name = station_doc.get('station_name', '')
            parts = full_name.split(', ')
            if len(parts) == 2:
                district = parts[1]
                stations_by_district.setdefault(district, []).append({'name': full_name})

        return jsonify(stations_by_district)
    except Exception as e:
        print(f"Error fetching police stations: {e}")
        return jsonify({"error": "Could not fetch police station data"}), 500

@app.route('/user/firs')
def get_user_firs():
    if session.get('role') != 'user' or 'username' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    username = session['username']
    user_firs = list(firs_collection.find({'username': username}).sort("filed_date", -1))

    for fir in user_firs:
        fir['_id'] = str(fir['_id'])
        fir['filed_date'] = fir['filed_date'].isoformat()
        if 'incident_date' in fir:
            fir['incident_date'] = fir['incident_date'].isoformat()

    return jsonify({'firs': user_firs})


def upload_file_to_cloudinary(file):
    if not file:
        return None
    try:
        upload_result = cloudinary.uploader.upload(file, resource_type="auto")
        return {
            "url": upload_result.get('secure_url'),
            "public_id": upload_result.get('public_id'),
            "resource_type": upload_result.get('resource_type')
        }
    except Exception as e:
        print(f"Cloudinary upload failed: {e}")
        raise e

@app.route('/fir/<fir_id>')
def get_fir_details(fir_id):
    if 'role' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        obj_id = ObjectId(fir_id)
        fir = firs_collection.find_one({'_id': obj_id})

        if not fir:
            return jsonify({'error': 'FIR not found'}), 404

        if session['role'] == 'user' and session['username'] != fir.get('username'):
            return jsonify({'error': 'Access denied'}), 403

        fir['_id'] = str(fir['_id'])
        if 'filed_date' in fir:
            fir['filed_date'] = fir['filed_date'].isoformat()
        if 'incident_date' in fir:
            fir['incident_date'] = fir['incident_date'].isoformat()

        return jsonify({'fir': fir})

    except Exception as e:
        print(f"Error fetching FIR details: {e}")
        return jsonify({'error': 'Invalid FIR ID or server error'}), 400

@app.route('/cancel_fir/<fir_id>', methods=['POST'])
def cancel_fir(fir_id):
    if session.get('role') != 'user' or 'username' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        obj_id = ObjectId(fir_id)
        fir = firs_collection.find_one({'_id': obj_id})

        if not fir:
            return jsonify({'error': 'FIR not found'}), 404

        if fir.get('username') != session['username']:
            return jsonify({'error': 'Access denied. You can only cancel your own FIRs.'}), 403

        if fir.get('fir_status') != 'Pending':
            return jsonify({'error': 'This FIR cannot be cancelled as it is already being processed.'}), 400

        for doc in fir.get('supporting_documents', []):
            try:
                cloudinary.uploader.destroy(
                    doc['public_id'],
                    resource_type=doc['resource_type']
                )
                print(f"Deleted {doc['public_id']} from Cloudinary.")
            except Exception as e:
                print(f"Could not delete file {doc.get('public_id')} from Cloudinary: {e}")

        result = firs_collection.delete_one({'_id': obj_id})

        if result.deleted_count == 1:
            return jsonify({'message': 'FIR cancelled successfully.'}), 200
        else:
            return jsonify({'error': 'Cancellation failed on the server.'}), 500

    except Exception as e:
        print(f"Error cancelling FIR {fir_id}: {e}")
        return jsonify({'error': 'An internal server error occurred.'}), 500


@app.route('/fir/<fir_id>/timeline')
def get_fir_timeline(fir_id):
    if 'role' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        obj_id = ObjectId(fir_id)
        fir = firs_collection.find_one({'_id': obj_id})

        if not fir:
            return jsonify({'error': 'FIR not found'}), 404

        timeline = [
            {
                'status': 'Filed',
                'timestamp': fir['filed_date'],
                'updated_by': fir.get('user_name', 'N/A'),
                'remarks': 'Initial report filed by the user.'
            }
        ]

        return jsonify({'timeline': timeline})

    except Exception as e:
        print(f"Error fetching FIR timeline: {e}")
        return jsonify({'error': 'Invalid FIR ID or server error'}), 400

@app.route('/chatbot/ask', methods=['POST'])
def chatbot_ask():
    if 'username' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    if not bard_chatbot:
        return jsonify({"response": "I am currently offline. My AI model is not configured."}), 503

    user_message = request.json.get('message')
    if not user_message:
        return jsonify({"error": "No message provided"}), 400

    if 'chat_history' not in session:
        session['chat_history'] = []

    try:
        persona_prompt = f"""
        ### Your Identity and Role
        You are FIR-Bot, an AI assistant for the 'Smart FIR Filing System'. Your tone must be **professional, empathetic, clear, and reassuring**. Avoid complex legal jargon.

        ### Formatting Rules (VERY IMPORTANT)
        - **Use Markdown:** Structure all your responses for maximum readability.
        - **Break Up Text:** Use short paragraphs. **NEVER** respond with a single, long block of text.
        - **Use Lists:** Use bullet points (`*`) for lists of items or suggestions (e.g., types of evidence). Use numbered lists (`1.`, `2.`) for step-by-step instructions.
        - **Use Bold:** Use bold text (`**text**`) to highlight key terms, actions, or important information. This is crucial for user guidance.

        ### Your Core Tasks
        1.  **Guide Users:** Help the user fill out the 'File a New FIR' form by explaining what each field means.
        2.  **Answer Questions:** Answer specific questions about the FIR filing process, what documents are needed, and the difference between various types of complaints.
        3.  **Explain Legal Rights:** Provide clear, general information about a citizen's legal rights. You **MUST** include a disclaimer that this is for informational purposes only and not legal advice.
        4.  **Check Status:** If a user asks about their FIR status, guide them to the **'Your Filed FIRs'** table on their dashboard.
        5.  **Handle Emergencies:** If the user describes a crime in progress, an immediate threat, or an injury, your **ABSOLUTE PRIORITY** is to advise them to **stop chatting and immediately call the emergency number 112**.

        ### Your Response
        Based on all the instructions above, provide a direct, helpful, and well-formatted response to the user's message.
        **Do NOT introduce yourself again** (e.g., "Hello, I am FIR-Bot...") unless the user asks who you are.

        User's message: "{user_message}"
        """

        response_data = bard_chatbot.get_answer(persona_prompt)
        bot_response = response_data['content']

        session['chat_history'].append({"role": "user", "text": user_message})
        session['chat_history'].append({"role": "bot", "text": bot_response})
        session.modified = True

        return jsonify({"response": bot_response})

    except Exception as e:
        print(f"Error during chatbot conversation: {e}")
        return jsonify({"response": f"An error occurred while trying to process your request: {e}"}), 500

@app.route('/chatbot/history', methods=['GET'])
def chatbot_history():
    if 'username' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    history = session.get('chat_history', [])
    return jsonify({"history": history})

@app.route('/chatbot/clear', methods=['POST'])
def chatbot_clear():
    if 'username' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    session.pop('chat_history', None)
    return jsonify({"message": "Chat history cleared successfully."})


with app.app_context():
    sync_admins_from_env()
    sync_officers_from_env() # --- CALLING THE NEW FUNCTION ---

if __name__ == "__main__":
    app.run(debug=True)