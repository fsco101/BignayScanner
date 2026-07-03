
from flask import Blueprint, request, jsonify, current_app, send_from_directory
from werkzeug.utils import secure_filename
import os
from datetime import datetime
from bson import ObjectId

bp = Blueprint('related_studies', __name__, url_prefix='/api')

UPLOAD_FOLDER = 'uploads/studies'
ALLOWED_EXTENSIONS = {'pdf'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_studies_collection():
    return current_app.config['db_forum'].database['related_studies']

@bp.route('/admin/related-studies', methods=['POST'])
def upload_study():
    col = get_studies_collection()
    # Support both form data and JSON
    if request.is_json:
        data = request.get_json()
        title = data.get('title')
        authors = data.get('authors')
        year = data.get('year')
        abstract = data.get('abstract')
        keywords = data.get('keywords')
        link = data.get('link')
        pdf = None
    else:
        title = request.form.get('title')
        authors = request.form.get('authors')
        year = request.form.get('year')
        abstract = request.form.get('abstract')
        keywords = request.form.get('keywords')
        link = request.form.get('link')
        pdf = request.files.get('pdf')
    pdf_filename = None
    if pdf and allowed_file(pdf.filename):
        os.makedirs(os.path.join(current_app.root_path, UPLOAD_FOLDER), exist_ok=True)
        filename = secure_filename(pdf.filename)
        pdf.save(os.path.join(current_app.root_path, UPLOAD_FOLDER, filename))
        pdf_filename = filename
    doc = {
        'title': title,
        'authors': authors,
        'year': year,
        'abstract': abstract,
        'keywords': keywords,
        'link': link,
        'pdf_filename': pdf_filename,
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow(),
    }
    result = col.insert_one(doc)
    doc['_id'] = str(result.inserted_id)
    return jsonify({'success': True, 'study': doc})

@bp.route('/related-studies', methods=['GET'])
def get_studies():
    col = get_studies_collection()
    studies = list(col.find().sort('created_at', -1))
    for s in studies:
        s['id'] = str(s['_id'])
        s.pop('_id', None)
        if s.get('authors') and isinstance(s['authors'], str):
            s['authors'] = [a.strip() for a in s['authors'].split(',') if a.strip()]
        if s.get('keywords') and isinstance(s['keywords'], str):
            s['keywords'] = [k.strip() for k in s['keywords'].split(',') if k.strip()]
    return jsonify({'studies': studies})

@bp.route('/related-studies/pdf/<filename>', methods=['GET'])
def get_pdf(filename):
    return send_from_directory(os.path.join(current_app.root_path, UPLOAD_FOLDER), filename)

@bp.route('/admin/related-studies/<study_id>', methods=['DELETE'])
def delete_study(study_id):
    col = get_studies_collection()
    try:
        result = col.delete_one({'_id': ObjectId(study_id)})
        if result.deleted_count == 0:
            return jsonify({'success': False, 'error': 'Study not found'}), 404
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@bp.route('/admin/related-studies/<study_id>', methods=['PUT'])
def update_study(study_id):
    col = get_studies_collection()
    try:
        data = request.get_json() if request.is_json else request.form.to_dict()
        update_doc = {}
        for field in ['title', 'authors', 'year', 'abstract', 'keywords', 'link']:
            if field in data:
                update_doc[field] = data[field]
        update_doc['updated_at'] = datetime.utcnow()
        result = col.update_one({'_id': ObjectId(study_id)}, {'$set': update_doc})
        if result.matched_count == 0:
            return jsonify({'success': False, 'error': 'Study not found'}), 404
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
