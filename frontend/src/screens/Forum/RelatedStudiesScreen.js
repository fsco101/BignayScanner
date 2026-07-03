import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import RelatedStudyCard from './RelatedStudyCard';
import { buildApiUrl } from '../../config/api';
import { useResponsive } from '../../hooks/useResponsive';
import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../context/ThemeContext';
import SweetAlert, { useSweetAlert } from '../../components/SweetAlert';

export default function RelatedStudiesScreen() {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);
  const { isDesktop, sp, fp, responsive } = useResponsive();
  const { isAuthenticated } = useAuth();
  const navigation = useNavigation();
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const { alertConfig, showWarning, hideAlert } = useSweetAlert();

  useEffect(() => {
    if (!isAuthenticated) {
      showWarning('Login Required', 'You must be logged in to view related studies.', {
        onConfirm: () => {
          hideAlert();
          navigation.getParent()?.navigate('Auth', { screen: 'Login' });
        },
      });
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.loginPrompt}>
          <View style={styles.loginPromptIcon}>
            <Ionicons name="lock-closed" size={48} color={COLORS.primary} />
          </View>
          <Text style={styles.loginPromptTitle}>Login Required</Text>
          <Text style={styles.loginPromptText}>
            Please login to view related studies and research articles about Bignay.
          </Text>
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={() => navigation.getParent()?.navigate('Auth', { screen: 'Login' })}
          >
            <Ionicons name="log-in-outline" size={20} color={COLORS.textOnPrimary} />
            <Text style={styles.loginBtnText}>Login / Register</Text>
          </TouchableOpacity>
        </View>
        <SweetAlert
          visible={alertConfig.visible}
          type={alertConfig.type}
          title={alertConfig.title}
          message={alertConfig.message}
          confirmText={alertConfig.confirmText}
          cancelText={alertConfig.cancelText}
          showCancel={alertConfig.showCancel}
          onConfirm={alertConfig.onConfirm}
          onCancel={hideAlert}
          onClose={hideAlert}
          confirmColor={alertConfig.confirmColor}
        />
      </View>
    );
  }

  const fetchStudies = async (q = '', year = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.append('q', q);
      if (year) params.append('year', year);
      const res = await fetch(buildApiUrl(`/api/related-studies?${params.toString()}`));
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setStudies(data.studies || data || []);
    } catch (e) {
      console.warn('Related studies fetch error', e);
      setStudies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudies();
  }, []);

  const onSearch = () => fetchStudies(query, yearFilter);

  const filteredStudies = useMemo(() => {
    let filtered = studies;
    if (query.trim()) {
      const q = query.toLowerCase();
      filtered = filtered.filter(s =>
        s.title?.toLowerCase().includes(q) ||
        (Array.isArray(s.authors) ? s.authors.join(' ') : s.authors || '').toLowerCase().includes(q) ||
        s.abstract?.toLowerCase().includes(q) ||
        (s.keywords || []).some(k => k.toLowerCase().includes(q))
      );
    }
    if (yearFilter.trim()) {
      filtered = filtered.filter(s => String(s.year) === yearFilter.trim());
    }
    return filtered;
  }, [studies, query, yearFilter]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Related Studies</Text>
          <Text style={styles.subtitle}>Academic and research references about Bignay</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{filteredStudies.length}</Text>
          <Text style={styles.countLabel}>Articles</Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={18} color={COLORS.textSecondary} />
          <TextInput
            placeholder="Search by keyword, author, or title..."
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={onSearch}
            placeholderTextColor={COLORS.textLight}
          />
          {query ? (
            <TouchableOpacity onPress={() => { setQuery(''); fetchStudies('', yearFilter); }}>
              <Ionicons name="close-circle" size={18} color={COLORS.textLight} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TextInput
          placeholder="Year"
          style={styles.yearInput}
          value={yearFilter}
          keyboardType="numeric"
          onChangeText={setYearFilter}
          placeholderTextColor={COLORS.textLight}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={onSearch}>
          <Ionicons name="search" size={18} color={COLORS.buttonText} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading studies...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.list,
            isDesktop && { maxWidth: 900, alignSelf: 'center', width: '100%' },
          ]}
          showsVerticalScrollIndicator={true}
          persistentScrollbar={true}
        >
          {filteredStudies.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="document-text-outline" size={48} color={COLORS.border} />
              <Text style={styles.empty}>No related studies found.</Text>
              <Text style={styles.emptySubtext}>Try adjusting your search criteria.</Text>
            </View>
          ) : (
            filteredStudies.map((s) => <RelatedStudyCard key={s.id || s._id || s.title} study={s} />)
          )}
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerTextWrap: { flex: 1 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  countBadge: { backgroundColor: COLORS.primaryLight, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, alignItems: 'center' },
  countText: { fontSize: 20, fontWeight: '700', color: COLORS.primary },
  countLabel: { fontSize: 11, color: COLORS.primaryDark || COLORS.primary, marginTop: 2 },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 16 },
  searchInputWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, flex: 1,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { marginLeft: 8, flex: 1, fontSize: 14, color: COLORS.text },
  yearInput: {
    width: 80, backgroundColor: COLORS.surface, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, fontSize: 14, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, textAlign: 'center',
  },
  searchBtn: { backgroundColor: COLORS.primary, padding: 12, borderRadius: 12 },
  list: { paddingBottom: 40 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  loadingText: { marginTop: 12, color: COLORS.textSecondary, fontSize: 14 },
  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  empty: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 12, fontSize: 16, fontWeight: '600' },
  emptySubtext: { textAlign: 'center', color: COLORS.textLight, marginTop: 4, fontSize: 13 },
  loginPrompt: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  loginPromptIcon: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  loginPromptTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  loginPromptText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  loginBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.primary,
    paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12,
  },
  loginBtnText: { color: COLORS.buttonText, fontWeight: '600', fontSize: 15 },
});
