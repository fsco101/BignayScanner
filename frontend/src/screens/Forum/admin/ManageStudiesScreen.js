import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TextInput, TouchableOpacity, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { buildApiUrl, getDefaultApiHeaders } from '../../../config/api';
import SweetAlert, { useSweetAlert } from '../../../components/SweetAlert';
import { rules, validateField } from '../../../utils/validation';
import { useThemeColors } from '../../../context/ThemeContext';

export default function ManageStudiesScreen() {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', authors: '', year: '', abstract: '', keywords: '', link: '', pdf: null });
  const [editingStudyId, setEditingStudyId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const { alertConfig, showSuccess, showError, showDelete, hideAlert } = useSweetAlert();

  // Validation state
  const [studyErrors, setStudyErrors] = useState({});
  const [studyTouched, setStudyTouched] = useState({});

  const studyFormRules = {
    title: [rules.required('Title')],
  };

  const touchStudyField = (field) => {
    setStudyTouched(prev => ({ ...prev, [field]: true }));
    const fieldErrors = validateField(form[field], studyFormRules[field] || []);
    setStudyErrors(prev => ({ ...prev, [field]: fieldErrors }));
  };

  const handleStudyFieldChange = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    if (studyTouched[field]) {
      const fieldErrors = validateField(value, studyFormRules[field] || []);
      setStudyErrors(prev => ({ ...prev, [field]: fieldErrors }));
    }
  };

  const validateStudyForm = () => {
    const allErrors = {};
    let isValid = true;
    Object.keys(studyFormRules).forEach(field => {
      const errs = validateField(form[field], studyFormRules[field]);
      if (errs) { allErrors[field] = errs; isValid = false; }
    });
    setStudyErrors(allErrors);
    setStudyTouched(prev => {
      const t = { ...prev };
      Object.keys(studyFormRules).forEach(f => t[f] = true);
      return t;
    });
    return isValid;
  };

  const fetchStudies = async () => {
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl('/api/related-studies'), {
        headers: getDefaultApiHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch studies');
      const data = await res.json();
      let studiesArr = [];
      if (Array.isArray(data)) {
        studiesArr = data;
      } else if (Array.isArray(data.studies)) {
        studiesArr = data.studies;
      }
      setStudies(studiesArr);
    } catch (e) {
      setStudies([]);
      showError('Error', 'Failed to load studies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStudies(); }, []);

  const resetFormState = () => {
    setForm({ title: '', authors: '', year: '', abstract: '', keywords: '', link: '', pdf: null });
    setEditingStudyId(null);
    setStudyErrors({});
    setStudyTouched({});
  };

  const handleToggleForm = () => {
    if (showForm) {
      setShowForm(false);
      resetFormState();
      return;
    }
    setShowForm(true);
    resetFormState();
  };

  const handleEditStudy = (study) => {
    const studyId = study.id || study._id;
    if (!studyId) {
      showError('Error', 'Cannot edit this study. Missing study ID.');
      return;
    }

    setEditingStudyId(studyId);
    setForm({
      title: study.title || '',
      authors: Array.isArray(study.authors) ? study.authors.join(', ') : (study.authors || ''),
      year: study.year ? String(study.year) : '',
      abstract: study.abstract || '',
      keywords: Array.isArray(study.keywords) ? study.keywords.join(', ') : (study.keywords || ''),
      link: study.link || '',
      pdf: null,
    });
    setStudyErrors({});
    setStudyTouched({});
    setShowForm(true);
  };

  const handlePickPDF = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        setForm(f => ({ ...f, pdf: res.assets[0] }));
      } else if (res.type === 'success') {
        setForm(f => ({ ...f, pdf: res }));
      }
    } catch (e) {
      console.warn('Document picker error', e);
    }
  };

  const handleSave = async () => {
    if (!validateStudyForm()) return;
    setIsSaving(true);
    try {
      let body, headers;
      if (!editingStudyId && form.pdf) {
        body = new FormData();
        body.append('title', form.title);
        body.append('authors', form.authors);
        body.append('year', form.year);
        body.append('abstract', form.abstract);
        body.append('keywords', form.keywords);
        body.append('link', form.link);
        const pdfFile = form.pdf;
        body.append('pdf', { uri: pdfFile.uri, name: pdfFile.name || 'study.pdf', type: 'application/pdf' });
        headers = { 'Accept': 'application/json' };
      } else {
        body = JSON.stringify({
          title: form.title,
          authors: form.authors,
          year: form.year,
          abstract: form.abstract,
          keywords: form.keywords,
          link: form.link,
        });
        headers = { 'Content-Type': 'application/json' };
      }
      const endpoint = editingStudyId
        ? buildApiUrl(`/api/admin/related-studies/${editingStudyId}`)
        : buildApiUrl('/api/admin/related-studies');
      const method = editingStudyId ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: getDefaultApiHeaders(headers),
        body,
      });
      if (!res.ok) throw new Error('Failed to save');
      setShowForm(false);
      resetFormState();
      showSuccess('Success', editingStudyId ? 'Study updated successfully' : 'Study added successfully');
      fetchStudies();
    } catch (e) {
      showError('Error', editingStudyId ? 'Failed to update study' : 'Failed to save study');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStudy = (studyId, studyTitle) => {
    showDelete(
      'Delete Study',
      `Are you sure you want to delete "${studyTitle}"? This cannot be undone.`,
      async () => {
        try {
          const res = await fetch(buildApiUrl(`/api/admin/related-studies/${studyId}`), {
            method: 'DELETE',
            headers: getDefaultApiHeaders(),
          });
          if (!res.ok) throw new Error('Failed to delete');
          showSuccess('Deleted', 'Study removed successfully');
          fetchStudies();
        } catch (e) {
          showError('Error', 'Failed to delete study');
        }
      }
    );
  };

  const openPdf = (filename) => {
    const url = buildApiUrl(`/api/related-studies/pdf/${filename}`);
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Manage Related Studies</Text>
          <Text style={styles.subtitle}>{studies.length} studies total</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={handleToggleForm}>
          <Ionicons name={showForm ? 'close' : 'add'} size={20} color={COLORS.buttonText} />
          <Text style={styles.addBtnText}>{showForm ? 'Cancel' : 'Add Study'}</Text>
        </TouchableOpacity>
      </View>

      {showForm && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>{editingStudyId ? 'Edit Study' : 'New Study'}</Text>
          <TextInput style={[styles.input, studyTouched.title && studyErrors.title && styles.inputError]} placeholder="Title *" value={form.title} onChangeText={t => handleStudyFieldChange('title', t)} onBlur={() => touchStudyField('title')} placeholderTextColor={COLORS.textLight} />
          {studyTouched.title && studyErrors.title ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
              <Text style={styles.errorText}>{studyErrors.title}</Text>
            </View>
          ) : null}
          <TextInput style={styles.input} placeholder="Authors (comma-separated)" value={form.authors} onChangeText={t => setForm(f => ({ ...f, authors: t }))} placeholderTextColor={COLORS.textLight} />
          <View style={styles.formRow}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Year" value={form.year} onChangeText={t => setForm(f => ({ ...f, year: t }))} keyboardType="numeric" placeholderTextColor={COLORS.textLight} />
            <TextInput style={[styles.input, { flex: 2 }]} placeholder="External Link (URL)" value={form.link} onChangeText={t => setForm(f => ({ ...f, link: t }))} placeholderTextColor={COLORS.textLight} />
          </View>
          <TextInput style={[styles.input, styles.multilineInput]} placeholder="Abstract / Summary" value={form.abstract} onChangeText={t => setForm(f => ({ ...f, abstract: t }))} multiline numberOfLines={4} placeholderTextColor={COLORS.textLight} />
          <TextInput style={styles.input} placeholder="Keywords (comma-separated)" value={form.keywords} onChangeText={t => setForm(f => ({ ...f, keywords: t }))} placeholderTextColor={COLORS.textLight} />
          {!editingStudyId ? (
            <TouchableOpacity style={styles.pdfPickBtn} onPress={handlePickPDF}>
              <Ionicons name="document-attach-outline" size={18} color={COLORS.primary} />
              <Text style={styles.pdfBtnText}>{form.pdf ? (form.pdf.name || 'PDF selected') : 'Attach PDF (optional)'}</Text>
              {form.pdf && (
                <TouchableOpacity onPress={() => setForm(f => ({ ...f, pdf: null }))}>
                  <Ionicons name="close-circle" size={18} color={COLORS.danger} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[styles.saveBtn, isSaving && { opacity: 0.7 }]} onPress={handleSave} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator size="small" color={COLORS.buttonText} />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color={COLORS.buttonText} />
                <Text style={styles.saveBtnText}>{editingStudyId ? 'Update Study' : 'Save Study'}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading studies...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {(!studies || studies.length === 0) ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="document-text-outline" size={48} color={COLORS.border} />
              <Text style={styles.empty}>No related studies found.</Text>
              <Text style={styles.emptySubtext}>Add your first study using the button above.</Text>
            </View>
          ) : (
            studies.map((s) => (
              <View key={s.id || s._id || s.title || Math.random()} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleWrap}>
                    <Text style={styles.cardTitle}>{s.title || 'Untitled'}</Text>
                    {s.year ? <Text style={styles.cardYear}>{s.year}</Text> : null}
                  </View>
                  <View style={styles.cardHeaderActions}>
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => handleEditStudy(s)}
                    >
                      <Ionicons name="create-outline" size={18} color={COLORS.link} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteStudy(s.id || s._id, s.title)}
                    >
                      <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.cardMeta}>
                  {Array.isArray(s.authors) ? s.authors.join(', ') : (s.authors || 'Unknown')}
                </Text>
                {s.abstract ? <Text style={styles.cardAbstract} numberOfLines={3}>{s.abstract}</Text> : null}
                {s.keywords && (Array.isArray(s.keywords) ? s.keywords : s.keywords.split(',')).length > 0 && (
                  <View style={styles.keywordsRow}>
                    {(Array.isArray(s.keywords) ? s.keywords : s.keywords.split(',')).slice(0, 5).map((k, i) => (
                      <Text key={`${k}-${i}`} style={styles.keywordTag}>{typeof k === 'string' ? k.trim() : k}</Text>
                    ))}
                  </View>
                )}
                <View style={styles.cardActions}>
                  {s.link ? (
                    <TouchableOpacity
                      onPress={() => Platform.OS === 'web' ? window.open(s.link, '_blank') : Linking.openURL(s.link)}
                      style={styles.cardActionBtn}
                    >
                      <Ionicons name="open-outline" size={14} color={COLORS.primary} />
                      <Text style={styles.cardActionText}>Open Link</Text>
                    </TouchableOpacity>
                  ) : null}
                  {s.pdf_filename ? (
                    <TouchableOpacity onPress={() => openPdf(s.pdf_filename)} style={styles.cardActionBtn}>
                      <Ionicons name="document-outline" size={14} color={COLORS.danger} />
                      <Text style={[styles.cardActionText, { color: COLORS.danger }]}>View PDF</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <SweetAlert
        visible={alertConfig.visible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        onConfirm={alertConfig.onConfirm || hideAlert}
        onCancel={hideAlert}
        onClose={hideAlert}
        showCancel={alertConfig.showCancel}
        autoClose={alertConfig.autoClose}
        closeOnOverlayPress={alertConfig.closeOnOverlayPress}
      />
    </View>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, gap: 6 },
  addBtnText: { color: COLORS.buttonText, fontWeight: '600', fontSize: 14 },
  form: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
  formTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 12 },
  formRow: { flexDirection: 'row', gap: 8 },
  input: { backgroundColor: COLORS.background, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  inputError: { borderColor: COLORS.danger, borderWidth: 1.5 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6, marginTop: -4 },
  errorText: { color: COLORS.danger, fontSize: 12 },
  multilineInput: { minHeight: 80, textAlignVertical: 'top' },
  pdfPickBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: COLORS.surfaceVariant, borderRadius: 10, marginBottom: 12 },
  pdfBtnText: { color: COLORS.primary, flex: 1, fontSize: 14 },
  saveBtn: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  saveBtnText: { color: COLORS.buttonText, fontWeight: '700', fontSize: 15 },
  list: { paddingBottom: 40 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  loadingText: { marginTop: 12, color: COLORS.textSecondary, fontSize: 14 },
  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  empty: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 12, fontSize: 16, fontWeight: '600' },
  emptySubtext: { textAlign: 'center', color: COLORS.textLight, marginTop: 4, fontSize: 13 },
  card: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, borderWidth: 1, borderColor: COLORS.divider },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardTitleWrap: { flex: 1, marginRight: 8 },
  cardHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontWeight: '700', fontSize: 15, color: COLORS.text, marginBottom: 4 },
  cardYear: { fontSize: 12, color: COLORS.textSecondary, backgroundColor: COLORS.background, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
  editBtn: { padding: 8, borderRadius: 8, backgroundColor: COLORS.linkBg },
  deleteBtn: { padding: 8, borderRadius: 8, backgroundColor: COLORS.dangerBg },
  cardMeta: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 6, fontStyle: 'italic' },
  cardAbstract: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 8, lineHeight: 19 },
  keywordsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  keywordTag: { fontSize: 11, color: COLORS.primary, backgroundColor: COLORS.primaryBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  cardActions: { flexDirection: 'row', gap: 12, borderTopWidth: 1, borderTopColor: COLORS.divider, paddingTop: 10 },
  cardActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: COLORS.surfaceVariant },
  cardActionText: { color: COLORS.primary, fontWeight: '600', fontSize: 12 },
});
