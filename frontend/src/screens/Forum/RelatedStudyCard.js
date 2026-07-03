import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { buildApiUrl } from '../../config/api';
import { useThemeColors } from '../../context/ThemeContext';

const openUrl = (url) => {
  if (!url) return;
  if (Platform.OS === 'web') window.open(url, '_blank');
  else Linking.openURL(url).catch(() => {});
};

const toArray = (val) => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) return val.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
};

/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
   Reusable Study Detail Modal
   Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */
export function StudyDetailModal({ visible, study, onClose }) {
  const COLORS = useThemeColors();
  const m = useMemo(() => createModalStyles(COLORS), [COLORS]);
  if (!study) return null;

  const authors = toArray(study.authors);
  const keywords = toArray(study.keywords);

  const openPdf = () =>
    study.pdf_filename && openUrl(buildApiUrl(`/api/related-studies/pdf/${study.pdf_filename}`));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          {/* Header */}
          <View style={m.header}>
            <View style={m.headerLeft}>
              <View style={m.headerIcon}>
                <Ionicons name="document-text" size={20} color={COLORS.primary} />
              </View>
              <Text style={m.headerTitle}>Study Details</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={m.closeBtn}>
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={m.body} showsVerticalScrollIndicator={false}>
            {/* Title card */}
            <View style={m.titleCard}>
              <Text style={m.studyTitle}>{study.title || 'Untitled'}</Text>
              {study.year ? (
                <View style={m.yearRow}>
                  <Ionicons name="calendar-outline" size={14} color={COLORS.textSecondary} />
                  <Text style={m.yearVal}>{study.year}</Text>
                </View>
              ) : null}
            </View>

            {/* Authors */}
            {authors.length > 0 && (
              <View style={m.section}>
                <View style={m.secHeader}>
                  <Ionicons name="people-outline" size={16} color={COLORS.primary} />
                  <Text style={m.secTitle}>Authors</Text>
                </View>
                <View style={m.chips}>
                  {authors.map((a, i) => (
                    <View key={`${a}-${i}`} style={m.authorChip}>
                      <Ionicons name="person-outline" size={12} color={COLORS.primary} />
                      <Text style={m.authorText}>{a}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Abstract */}
            {study.abstract ? (
              <View style={m.section}>
                <View style={m.secHeader}>
                  <Ionicons name="reader-outline" size={16} color={COLORS.primary} />
                  <Text style={m.secTitle}>Abstract</Text>
                </View>
                <Text style={m.abstractText}>{study.abstract}</Text>
              </View>
            ) : null}

            {/* Keywords */}
            {keywords.length > 0 && (
              <View style={m.section}>
                <View style={m.secHeader}>
                  <Ionicons name="pricetags-outline" size={16} color={COLORS.primary} />
                  <Text style={m.secTitle}>Keywords</Text>
                </View>
                <View style={m.chips}>
                  {keywords.map((k, i) => (
                    <View key={`${k}-${i}`} style={m.kwPill}>
                      <Text style={m.kwText}>{k}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Resources */}
            {(study.link || study.pdf_filename) ? (
              <View style={m.section}>
                <View style={m.secHeader}>
                  <Ionicons name="link-outline" size={16} color={COLORS.primary} />
                  <Text style={m.secTitle}>Resources</Text>
                </View>
                <View style={{ gap: 8 }}>
                  {study.link ? (
                    <TouchableOpacity style={m.resBtn} onPress={() => openUrl(study.link)} activeOpacity={0.7}>
                      <View style={[m.resIcon, { backgroundColor: COLORS.linkBg }]}>
                        <Ionicons name="open-outline" size={18} color={COLORS.link} />
                      </View>
                      <View style={m.resInfo}>
                        <Text style={m.resTitle}>Open External Link</Text>
                        <Text style={m.resSub} numberOfLines={1}>{study.link}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
                    </TouchableOpacity>
                  ) : null}
                  {study.pdf_filename ? (
                    <TouchableOpacity style={m.resBtn} onPress={openPdf} activeOpacity={0.7}>
                      <View style={[m.resIcon, { backgroundColor: COLORS.dangerBg }]}>
                        <Ionicons name="document-outline" size={18} color={COLORS.danger} />
                      </View>
                      <View style={m.resInfo}>
                        <Text style={m.resTitle}>View PDF Document</Text>
                        <Text style={m.resSub} numberOfLines={1}>{study.pdf_filename}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Fallback */}
            {!study.abstract && keywords.length === 0 && !study.link && !study.pdf_filename ? (
              <View style={m.emptyWrap}>
                <Ionicons name="information-circle-outline" size={32} color={COLORS.textLight} />
                <Text style={m.emptyText}>No additional details available for this study.</Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
   Study Card (list item)
   Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */
export default function RelatedStudyCard({ study }) {
  const COLORS = useThemeColors();
  const s = useMemo(() => createCardStyles(COLORS), [COLORS]);
  const [showDetail, setShowDetail] = useState(false);

  const authors = Array.isArray(study.authors)
    ? study.authors.join(', ')
    : study.authors || 'Unknown Authors';

  const keywords = toArray(study.keywords);

  return (
    <>
      <TouchableOpacity style={s.card} onPress={() => setShowDetail(true)} activeOpacity={0.7}>
        <View style={s.inner}>
          <View style={s.accent} />
          <View style={s.content}>
            {/* Top row */}
            <View style={s.topRow}>
              <View style={s.iconWrap}>
                <Ionicons name="document-text" size={20} color={COLORS.primary} />
              </View>
              <View style={s.titleWrap}>
                <Text style={s.title} numberOfLines={2}>{study.title || 'Untitled'}</Text>
                <Text style={s.authors} numberOfLines={1}>{authors}</Text>
              </View>
              {study.year ? (
                <View style={s.yearBadge}>
                  <Text style={s.yearText}>{study.year}</Text>
                </View>
              ) : null}
            </View>

            {/* Abstract */}
            {study.abstract ? (
              <Text style={s.abstract} numberOfLines={3}>{study.abstract}</Text>
            ) : null}

            {/* Keywords */}
            {keywords.length > 0 && (
              <View style={s.kwRow}>
                {keywords.slice(0, 4).map((k, i) => (
                  <View key={`${k}-${i}`} style={s.kwPill}>
                    <Text style={s.kwText}>{k}</Text>
                  </View>
                ))}
                {keywords.length > 4 && (
                  <View style={[s.kwPill, s.kwMore]}>
                    <Text style={[s.kwText, { color: COLORS.textLight }]}>+{keywords.length - 4}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Footer */}
            <View style={s.footer}>
              <View style={s.indicators}>
                {study.link ? (
                  <View style={s.ind}>
                    <Ionicons name="link-outline" size={13} color={COLORS.link} />
                    <Text style={[s.indText, { color: COLORS.link }]}>Link</Text>
                  </View>
                ) : null}
                {study.pdf_filename ? (
                  <View style={s.ind}>
                    <Ionicons name="document-outline" size={13} color={COLORS.danger} />
                    <Text style={[s.indText, { color: COLORS.danger }]}>PDF</Text>
                  </View>
                ) : null}
              </View>
              <View style={s.viewBtn}>
                <Text style={s.viewText}>View Details</Text>
                <Ionicons name="chevron-forward" size={14} color={COLORS.primary} />
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      <StudyDetailModal visible={showDetail} study={study} onClose={() => setShowDetail(false)} />
    </>
  );
}

/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Card styles Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */
const createCardStyles = (COLORS) => StyleSheet.create({
  card: {
    marginBottom: 12,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  inner: { flexDirection: 'row' },
  accent: { width: 4, backgroundColor: COLORS.primary },
  content: { flex: 1, padding: 14 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: COLORS.primaryBg, justifyContent: 'center', alignItems: 'center', marginTop: 1,
  },
  titleWrap: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.text, lineHeight: 21, marginBottom: 2 },
  authors: { fontSize: 12, color: COLORS.textSecondary, fontStyle: 'italic' },
  yearBadge: {
    backgroundColor: COLORS.background, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1, borderColor: COLORS.border,
  },
  yearText: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
  abstract: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginTop: 10 },
  kwRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  kwPill: { backgroundColor: COLORS.primaryBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  kwText: { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
  kwMore: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.divider,
  },
  indicators: { flexDirection: 'row', gap: 10 },
  ind: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  indText: { fontSize: 11, fontWeight: '600' },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
});

/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Modal styles Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */
const createModalStyles = (COLORS) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.primaryBg, justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  closeBtn: { padding: 4 },
  body: { padding: 18, paddingBottom: 32, gap: 16 },
  titleCard: {
    backgroundColor: COLORS.primaryBg, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  studyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, lineHeight: 26 },
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  yearVal: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  section: {
    backgroundColor: COLORS.background, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.divider,
  },
  secHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  secTitle: { fontSize: 13, fontWeight: '800', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 0.4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  authorChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.surface, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: COLORS.border,
  },
  authorText: { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  abstractText: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 22 },
  kwPill: { backgroundColor: COLORS.primaryBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  kwText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  resBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
    borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.border, gap: 12,
  },
  resIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  resInfo: { flex: 1 },
  resTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  resSub: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  emptyWrap: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 13, color: COLORS.textLight, textAlign: 'center' },
});
