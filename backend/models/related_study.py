from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class RelatedStudy(db.Model):
    __tablename__ = 'related_studies'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    authors = db.Column(db.String(255))
    year = db.Column(db.String(10))
    abstract = db.Column(db.Text)
    keywords = db.Column(db.String(255))
    link = db.Column(db.String(512))
    pdf_filename = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'authors': self.authors.split(',') if self.authors else [],
            'year': self.year,
            'abstract': self.abstract,
            'keywords': self.keywords.split(',') if self.keywords else [],
            'link': self.link,
            'pdf_filename': self.pdf_filename,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
