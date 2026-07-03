import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Animated,
  LayoutAnimation,
  UIManager,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Line, Text as SvgText, Defs, LinearGradient, Stop, Rect, G } from 'react-native-svg';

import { useResponsive } from '../../hooks/useResponsive';
import { useThemeColors } from '../../context/ThemeContext';
import { API_CONFIG } from '../../config/api';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ──────────────────────────────────────────────────────────────────────────────
//  Date helpers — fallback labels are always relative to the current date
// ──────────────────────────────────────────────────────────────────────────────

const _today = new Date();
const _MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Format "Mmm D"  e.g. "Feb 26" */
const _fmtDay   = (d) => `${_MONTHS[d.getMonth()]} ${d.getDate()}`;
/** Format "Mmm 'YY"  e.g. "Feb '26" */
const _fmtMoYr  = (d) => `${_MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
/** Format "Mmm YYYY"  e.g. "Feb 2026" */
const _fmtMoFull = (d) => `${_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
/** Date offset in days from today */
const _dOff = (days) => { const d = new Date(_today); d.setDate(d.getDate() + days); return d; };
/** Date offset in months from today */
const _mOff = (months) => { const d = new Date(_today); d.setMonth(d.getMonth() + months); return d; };

// ──────────────────────────────────────────────────────────────────────────────
//  Fallback static data — shown while live data loads or on network error
// ──────────────────────────────────────────────────────────────────────────────

const PRICE_HISTORY = {
  '1D': [
    { date: '6 AM', price: 178 },
    { date: '8 AM', price: 179 },
    { date: '10 AM', price: 181 },
    { date: '12 PM', price: 180 },
    { date: '2 PM', price: 182 },
    { date: '4 PM', price: 180 },
    { date: '6 PM', price: 180 },
  ],
  '7D': [
    { date: _fmtDay(_dOff(-6)), price: 172 },
    { date: _fmtDay(_dOff(-5)), price: 168 },
    { date: _fmtDay(_dOff(-4)), price: 175 },
    { date: _fmtDay(_dOff(-3)), price: 170 },
    { date: _fmtDay(_dOff(-2)), price: 178 },
    { date: _fmtDay(_dOff(-1)), price: 182 },
    { date: _fmtDay(_today),    price: 180 },
  ],
  '2W': [
    { date: _fmtDay(_dOff(-13)), price: 165 },
    { date: _fmtDay(_dOff(-11)), price: 168 },
    { date: _fmtDay(_dOff(-9)),  price: 170 },
    { date: _fmtDay(_dOff(-7)),  price: 172 },
    { date: _fmtDay(_dOff(-5)),  price: 172 },
    { date: _fmtDay(_dOff(-3)),  price: 175 },
    { date: _fmtDay(_dOff(-1)),  price: 178 },
    { date: _fmtDay(_today),     price: 180 },
  ],
  '1M': [
    { date: _fmtDay(_dOff(-30)), price: 155 },
    { date: _fmtDay(_dOff(-27)), price: 158 },
    { date: _fmtDay(_dOff(-23)), price: 160 },
    { date: _fmtDay(_dOff(-20)), price: 162 },
    { date: _fmtDay(_dOff(-16)), price: 165 },
    { date: _fmtDay(_dOff(-13)), price: 168 },
    { date: _fmtDay(_dOff(-9)),  price: 172 },
    { date: _fmtDay(_dOff(-6)),  price: 174 },
    { date: _fmtDay(_dOff(-3)),  price: 176 },
    { date: _fmtDay(_today),     price: 180 },
  ],
  '3M': [
    { date: _fmtMoYr(_mOff(-3)), price: 170 },
    { date: _fmtMoYr(_mOff(-2)), price: 158 },
    { date: _fmtMoYr(_mOff(-1)), price: 162 },
    { date: _fmtMoYr(_today),    price: 180 },
  ],
  '6M': [
    { date: _fmtMoYr(_mOff(-6)), price: 200 },
    { date: _fmtMoYr(_mOff(-5)), price: 195 },
    { date: _fmtMoYr(_mOff(-4)), price: 185 },
    { date: _fmtMoYr(_mOff(-3)), price: 170 },
    { date: _fmtMoYr(_mOff(-2)), price: 158 },
    { date: _fmtMoYr(_mOff(-1)), price: 162 },
    { date: _fmtMoYr(_today),    price: 180 },
  ],
  '1Y': [
    { date: _fmtMoYr(_mOff(-12)), price: 168 },
    { date: _fmtMoYr(_mOff(-11)), price: 140 },
    { date: _fmtMoYr(_mOff(-10)), price: 118 },
    { date: _fmtMoYr(_mOff(-9)),  price: 110 },
    { date: _fmtMoYr(_mOff(-8)),  price: 130 },
    { date: _fmtMoYr(_mOff(-7)),  price: 155 },
    { date: _fmtMoYr(_mOff(-6)),  price: 200 },
    { date: _fmtMoYr(_mOff(-5)),  price: 195 },
    { date: _fmtMoYr(_mOff(-4)),  price: 185 },
    { date: _fmtMoYr(_mOff(-3)),  price: 170 },
    { date: _fmtMoYr(_mOff(-2)),  price: 158 },
    { date: _fmtMoYr(_mOff(-1)),  price: 162 },
    { date: _fmtMoYr(_today),     price: 180 },
  ],
  'ALL': [
    { date: _fmtMoYr(_mOff(-24)), price: 155 },
    { date: _fmtMoYr(_mOff(-21)), price: 100 },
    { date: _fmtMoYr(_mOff(-18)), price: 190 },
    { date: _fmtMoYr(_mOff(-15)), price: 165 },
    { date: _fmtMoYr(_mOff(-12)), price: 168 },
    { date: _fmtMoYr(_mOff(-9)),  price: 110 },
    { date: _fmtMoYr(_mOff(-6)),  price: 200 },
    { date: _fmtMoYr(_mOff(-3)),  price: 170 },
    { date: _fmtMoYr(_today),     price: 180 },
  ],
};

const PRICE_FORECAST = {
  '1D': [
    { date: '8 PM', price: 181 },
  ],
  '7D': [
    { date: _fmtDay(_dOff(1)), price: 183 },
    { date: _fmtDay(_dOff(2)), price: 186 },
    { date: _fmtDay(_dOff(3)), price: 190 },
  ],
  '2W': [
    { date: _fmtDay(_dOff(2)), price: 183 },
    { date: _fmtDay(_dOff(4)), price: 187 },
    { date: _fmtDay(_dOff(6)), price: 192 },
  ],
  '1M': [
    { date: _fmtDay(_dOff(3)),  price: 183 },
    { date: _fmtDay(_dOff(7)),  price: 186 },
    { date: _fmtDay(_dOff(11)), price: 188 },
    { date: _fmtDay(_dOff(15)), price: 185 },
  ],
  '3M': [
    { date: _fmtMoYr(_mOff(1)), price: 155 },
    { date: _fmtMoYr(_mOff(2)), price: 130 },
  ],
  '6M': [
    { date: _fmtMoYr(_mOff(1)), price: 155 },
    { date: _fmtMoYr(_mOff(2)), price: 125 },
    { date: _fmtMoYr(_mOff(3)), price: 115 },
  ],
  '1Y': [
    { date: _fmtMoYr(_mOff(1)), price: 155 },
    { date: _fmtMoYr(_mOff(3)), price: 115 },
    { date: _fmtMoYr(_mOff(6)), price: 195 },
  ],
  'ALL': [
    { date: _fmtMoYr(_mOff(3)), price: 115 },
    { date: _fmtMoYr(_mOff(6)), price: 195 },
  ],
};

const FORECAST_DESCRIPTION = {
  '1D': 'next 2 hours',
  '7D': 'next 3 days',
  '2W': 'next week',
  '1M': 'next 2 weeks',
  '3M': 'next 2 months',
  '6M': 'next 3 months',
  '1Y': 'next 6 months',
  'ALL': 'next 6 months',
};

const MARKET_INSIGHTS = [
  {
    id: '1',
    title: 'Peak Season Approaching',
    description: 'Bignay harvest season (March–May) expected to lower fresh fruit prices 15–20% as supply peaks in Batangas, Quezon, and Laguna provinces.',
    trend: 'down',
    icon: '📅',
    date: _fmtMoFull(_today),
  },
  {
    id: '2',
    title: 'Wine Export Interest Growing',
    description: 'DTI recorded 12% increase in Bignay wine export inquiries from Japan and South Korea in Q4 2025, potentially lifting premium prices.',
    trend: 'up',
    icon: '🍷',
    date: _fmtMoFull(_mOff(-1)),
  },
  {
    id: '3',
    title: 'Dried Leaf Tea Demand Surge',
    description: 'Health-conscious consumers are driving dried Bignay leaf prices up — now ₱95–120/pack vs ₱75 last year.',
    trend: 'up',
    icon: '🍃',
    date: _fmtMoFull(_today),
  },
];

const PRODUCT_PRICES = [
  { name: 'Fresh Bignay (Premium)', price: 180, prevPrice: 175, unit: '/kg', emoji: '🍇' },
  { name: 'Fresh Bignay (Standard)', price: 140, prevPrice: 138, unit: '/kg', emoji: '🫐' },
  { name: 'Bignay Wine (750 ml)', price: 380, prevPrice: 395, unit: '/bottle', emoji: '🍷' },
  { name: 'Bignay Jam (250 g)', price: 145, prevPrice: 145, unit: '/jar', emoji: '🫙' },
  { name: 'Bignay Vinegar (500 ml)', price: 120, prevPrice: 115, unit: '/bottle', emoji: '🫗' },
  { name: 'Dried Bignay Leaf Tea', price: 110, prevPrice: 95, unit: '/50g pack', emoji: '🍃' },
];

const SEASONAL_DATA = [
  { month: 'Jan', avg: 160, range: [145, 175] },
  { month: 'Feb', avg: 175, range: [160, 190] },
  { month: 'Mar', avg: 145, range: [120, 170] },
  { month: 'Apr', avg: 125, range: [100, 150] },
  { month: 'May', avg: 115, range: [95, 135] },
  { month: 'Jun', avg: 135, range: [115, 155] },
  { month: 'Jul', avg: 160, range: [140, 180] },
  { month: 'Aug', avg: 175, range: [155, 195] },
  { month: 'Sep', avg: 195, range: [175, 215] },
  { month: 'Oct', avg: 190, range: [170, 210] },
  { month: 'Nov', avg: 175, range: [155, 195] },
  { month: 'Dec', avg: 160, range: [140, 180] },
];

// ──────────────────────────────────────────────────────────────────────────────
//  SVG Line Chart Component
// ──────────────────────────────────────────────────────────────────────────────

const LineChart = ({
  data,
  forecast = [],
  width = 340,
  height = 200,
  primaryColor = '#6366F1',
  forecastColor = '#94A3B8',
  bgColor = '#FFFFFF',
  textColor = '#64748B',
  gridColor = '#E2E8F0',
  showArea = true,
  selectedIndex,
  onSelectPoint,
}) => {
  const PAD = { top: 24, right: 16, bottom: 32, left: 44 };
  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;

  const allPrices = [...data.map(d => d.price), ...forecast.map(d => d.price)];
  const maxP = Math.max(...allPrices);
  const minP = Math.min(...allPrices);
  const rangeP = maxP - minP || 1;
  const paddedMin = minP - rangeP * 0.15;
  const paddedMax = maxP + rangeP * 0.1;
  const pRange = paddedMax - paddedMin;

  const totalPts = data.length + forecast.length;

  const toX = (i) => PAD.left + (i / (totalPts - 1)) * chartW;
  const toY = (p) => PAD.top + (1 - (p - paddedMin) / pRange) * chartH;

  // Build path strings
  const dataPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d.price).toFixed(1)}`).join(' ');
  const areaPath = dataPath + ` L${toX(data.length - 1).toFixed(1)},${(PAD.top + chartH).toFixed(1)} L${toX(0).toFixed(1)},${(PAD.top + chartH).toFixed(1)} Z`;

  let forecastPath = '';
  let forecastAreaPath = '';
  if (forecast.length > 0) {
    const start = data.length - 1;
    const lastDataPt = data[data.length - 1];
    const fPts = [lastDataPt, ...forecast];
    forecastPath = fPts.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(start + i).toFixed(1)},${toY(d.price).toFixed(1)}`).join(' ');
    forecastAreaPath = forecastPath + ` L${toX(totalPts - 1).toFixed(1)},${(PAD.top + chartH).toFixed(1)} L${toX(start).toFixed(1)},${(PAD.top + chartH).toFixed(1)} Z`;
  }

  // Y-axis ticks
  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks }, (_, i) => paddedMin + (pRange / (yTicks - 1)) * i);

  const allData = [...data, ...forecast];
  const selIdx = selectedIndex != null ? selectedIndex : null;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={primaryColor} stopOpacity="0.3" />
          <Stop offset="100%" stopColor={primaryColor} stopOpacity="0.02" />
        </LinearGradient>
        <LinearGradient id="forecastAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={forecastColor} stopOpacity="0.15" />
          <Stop offset="100%" stopColor={forecastColor} stopOpacity="0.01" />
        </LinearGradient>
      </Defs>

      {/* Background */}
      <Rect x={0} y={0} width={width} height={height} fill={bgColor} rx={12} />

      {/* Grid lines + Y-axis labels */}
      {yTickValues.map((val, i) => {
        const y = toY(val);
        return (
          <React.Fragment key={`y-${i}`}>
            <Line x1={PAD.left} y1={y} x2={width - PAD.right} y2={y} stroke={gridColor} strokeWidth={0.8} strokeDasharray={i === 0 ? '' : '4,3'} />
            <SvgText x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={10} fill={textColor} fontWeight="500">
              ₱{Math.round(val)}
            </SvgText>
          </React.Fragment>
        );
      })}

      {/* X-axis labels */}
      {allData.map((d, i) => {
        const showLabel = totalPts <= 8 || i % Math.ceil(totalPts / 7) === 0 || i === totalPts - 1;
        if (!showLabel) return null;
        return (
          <SvgText key={`x-${i}`} x={toX(i)} y={height - 8} textAnchor="middle" fontSize={9} fill={i >= data.length ? forecastColor : textColor} fontWeight="500">
            {d.date}
          </SvgText>
        );
      })}

      {/* Forecast divider line */}
      {forecast.length > 0 && (
        <Line
          x1={toX(data.length - 1)}
          y1={PAD.top}
          x2={toX(data.length - 1)}
          y2={PAD.top + chartH}
          stroke={forecastColor}
          strokeWidth={1}
          strokeDasharray="3,3"
        />
      )}

      {/* Area fills */}
      {showArea && <Path d={areaPath} fill="url(#areaGrad)" />}
      {forecastAreaPath ? <Path d={forecastAreaPath} fill="url(#forecastAreaGrad)" /> : null}

      {/* Data line */}
      <Path d={dataPath} stroke={primaryColor} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />

      {/* Forecast line */}
      {forecastPath ? (
        <Path d={forecastPath} stroke={forecastColor} strokeWidth={2} fill="none" strokeDasharray="6,4" strokeLinejoin="round" strokeLinecap="round" />
      ) : null}

      {/* Data points */}
      {data.map((d, i) => (
        <Circle key={`dp-${i}`} cx={toX(i)} cy={toY(d.price)} r={3.5} fill={bgColor} stroke={primaryColor} strokeWidth={2} />
      ))}

      {/* Forecast points */}
      {forecast.map((d, i) => (
        <Circle key={`fp-${i}`} cx={toX(data.length + i)} cy={toY(d.price)} r={3} fill={bgColor} stroke={forecastColor} strokeWidth={1.5} strokeDasharray="2,2" />
      ))}

      {/* Selected point indicator */}
      {selIdx != null && selIdx < allData.length && (
        <G>
          <Line
            x1={toX(selIdx)} y1={PAD.top} x2={toX(selIdx)} y2={PAD.top + chartH}
            stroke={selIdx >= data.length ? forecastColor : primaryColor}
            strokeWidth={1} strokeDasharray="4,3" opacity={0.5}
          />
          <Circle cx={toX(selIdx)} cy={toY(allData[selIdx].price)} r={7}
            fill={selIdx >= data.length ? forecastColor : primaryColor} opacity={0.2} />
          <Circle cx={toX(selIdx)} cy={toY(allData[selIdx].price)} r={5}
            fill={selIdx >= data.length ? forecastColor : primaryColor} />
          {/* Tooltip bubble */}
          <Rect x={toX(selIdx) - 32} y={toY(allData[selIdx].price) - 28} width={64} height={20} rx={6}
            fill={selIdx >= data.length ? forecastColor : primaryColor} />
          <SvgText x={toX(selIdx)} y={toY(allData[selIdx].price) - 14} textAnchor="middle" fontSize={10} fontWeight="700" fill="#FFFFFF">
            ₱{allData[selIdx].price}
          </SvgText>
        </G>
      )}

      {/* Highlight endpoints when nothing selected */}
      {selIdx == null && data.length > 0 && (
        <G>
          <Circle cx={toX(data.length - 1)} cy={toY(data[data.length - 1].price)} r={5} fill={primaryColor} />
          <SvgText x={toX(data.length - 1)} y={toY(data[data.length - 1].price) - 10} textAnchor="middle" fontSize={11} fontWeight="700" fill={primaryColor}>
            ₱{data[data.length - 1].price}
          </SvgText>
        </G>
      )}
      {selIdx == null && forecast.length > 0 && (
        <SvgText
          x={toX(totalPts - 1)}
          y={toY(forecast[forecast.length - 1].price) - 10}
          textAnchor="middle" fontSize={10} fontWeight="600" fill={forecastColor}
        >
          ₱{forecast[forecast.length - 1].price}
        </SvgText>
      )}

      {/* Invisible touch targets */}
      {allData.map((d, i) => (
        <Rect
          key={`touch-${i}`}
          x={toX(i) - chartW / totalPts / 2}
          y={PAD.top}
          width={chartW / totalPts}
          height={chartH}
          fill="transparent"
          onPress={() => onSelectPoint && onSelectPoint(i === selIdx ? null : i)}
        />
      ))}
    </Svg>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
//  Seasonal Mini Bar Chart
// ──────────────────────────────────────────────────────────────────────────────
const SeasonalChart = ({ data, width = 340, height = 140, primaryColor, textColor, gridColor, bgColor }) => {
  const PAD = { top: 14, right: 8, bottom: 24, left: 8 };
  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;
  const barW = chartW / data.length;
  const maxVal = Math.max(...data.map(d => d.range[1]));
  const minVal = Math.min(...data.map(d => d.range[0]));
  const pRange = maxVal - minVal || 1;

  const toY = (v) => PAD.top + (1 - (v - minVal + 10) / (pRange + 20)) * chartH;

  const currentMonthIdx = new Date().getMonth(); // 0-based

  return (
    <Svg width={width} height={height}>
      <Rect x={0} y={0} width={width} height={height} fill={bgColor} rx={10} />
      {data.map((d, i) => {
        const x = PAD.left + i * barW + barW * 0.2;
        const w = barW * 0.6;
        const yHigh = toY(d.range[1]);
        const yLow = toY(d.range[0]);
        const yAvg = toY(d.avg);
        const isHighlight = i === currentMonthIdx;
        return (
          <React.Fragment key={i}>
            {/* Range bar */}
            <Rect x={x} y={yHigh} width={w} height={Math.max(2, yLow - yHigh)} rx={3}
              fill={isHighlight ? primaryColor + '40' : gridColor} />
            {/* Average marker */}
            <Line x1={x} y1={yAvg} x2={x + w} y2={yAvg}
              stroke={isHighlight ? primaryColor : textColor} strokeWidth={isHighlight ? 2 : 1.5} strokeLinecap="round" />
            {/* Month label */}
            <SvgText x={x + w / 2} y={height - 6} textAnchor="middle" fontSize={9}
              fill={isHighlight ? primaryColor : textColor} fontWeight={isHighlight ? '700' : '400'}>
              {d.month}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
//  Main Screen
// ──────────────────────────────────────────────────────────────────────────────
export default function PricePredictionScreen() {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const [timeframe, setTimeframe] = useState('7D');
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [expandedInsight, setExpandedInsight] = useState(null);
  const { width: screenWidth, isDesktop, isTablet, sp, fp, responsive, maxContentWidth } = useResponsive();

  // ── Live data state ───────────────────────────────────────────────────────
  const [liveData, setLiveData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const fetchLiveData = useCallback(async (tf, isRefresh = false) => {
    try {
      if (isRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      setFetchError(null);
      const url = `${API_CONFIG.BASE_URL}/api/price-prediction/full?timeframe=${tf}`;
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.ok) setLiveData(json);
      else throw new Error(json.error || 'Unknown error');
    } catch (err) {
      console.warn('[PricePrediction] fetch error:', err.message);
      setFetchError(err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchLiveData(timeframe); }, [timeframe]);

  // ── Pulsing live indicator animation ─────────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const chartFadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 1000, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: false }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // ── Animate chart on timeframe change ────────────────────────────────────
  const handleTimeframeChange = useCallback((tf) => {
    if (tf === timeframe) return;
    setSelectedPoint(null);
    Animated.sequence([
      Animated.timing(chartFadeAnim, { toValue: 0, duration: 120, useNativeDriver: false }),
      Animated.timing(chartFadeAnim, { toValue: 0, duration: 10, useNativeDriver: false }),
    ]).start(() => {
      setTimeframe(tf);
      Animated.timing(chartFadeAnim, { toValue: 1, duration: 300, easing: (t) => 1 - Math.pow(1 - t, 3), useNativeDriver: false }).start();
    });
  }, [timeframe, chartFadeAnim]);

  const toggleInsight = useCallback((id) => {
    setExpandedInsight(prev => prev === id ? null : id);
  }, []);

  const chartWidth = Math.min(screenWidth - 32, isDesktop ? 680 : isTablet ? 560 : 380);

  // ── Derive display data from live or fallback to static constants ─────────
  const data = liveData?.history || PRICE_HISTORY[timeframe];
  const forecast = liveData?.forecast || PRICE_FORECAST[timeframe];
  const currentPrice = liveData?.stats?.current_price ?? data[data.length - 1].price;
  const predictedPrice = liveData?.stats?.predicted_price ?? forecast[forecast.length - 1]?.price ?? currentPrice;
  const priceChange = ((predictedPrice - currentPrice) / currentPrice * 100).toFixed(1);
  const firstPrice = liveData?.stats?.first_price ?? data[0].price;
  const periodChange = ((currentPrice - firstPrice) / firstPrice * 100).toFixed(1);
  const highPrice = liveData?.stats?.high ?? Math.max(...data.map(d => d.price));
  const lowPrice = liveData?.stats?.low ?? Math.min(...data.map(d => d.price));
  const avgPrice = liveData?.stats?.avg ?? Math.round(data.reduce((a, b) => a + b.price, 0) / data.length);
  const forecastDesc = liveData?.forecast_description || FORECAST_DESCRIPTION[timeframe] || 'upcoming';
  const asOfText = liveData?.as_of || `${_fmtDay(_today)}, Philippine Market`;
  const productPrices = liveData?.products || PRODUCT_PRICES;
  const seasonalData = liveData?.seasonal_data || SEASONAL_DATA;
  const marketInsights = liveData?.insights || MARKET_INSIGHTS;
  const dataSource = liveData?.data_source || 'static';

  const allData = [...data, ...forecast];

  const timeframes = [
    { key: '1D', label: '1D' },
    { key: '7D', label: '7D' },
    { key: '2W', label: '2W' },
    { key: '1M', label: '1M' },
    { key: '3M', label: '3M' },
    { key: '6M', label: '6M' },
    { key: '1Y', label: '1Y' },
    { key: 'ALL', label: 'ALL' },
  ];

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => fetchLiveData(timeframe, true)}
          colors={[COLORS.primary]}
          tintColor={COLORS.primary}
        />
      }
      contentContainerStyle={isDesktop ? {
        maxWidth: Math.min(maxContentWidth, 900),
        width: '100%',
        alignSelf: 'center',
        paddingHorizontal: sp(24),
        paddingBottom: 32,
      } : { paddingBottom: 32 }}
    >
      {/* ── Price Summary Card ────────────────────────────── */}
      <View style={styles.priceCard}>
        <View style={styles.priceCardTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.liveBadgeRow}>
              <Text style={styles.priceLabel}>Fresh Bignay · Premium Grade</Text>
              <View style={styles.liveBadge}>
                <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
            <View style={styles.priceMain}>
              <Text style={styles.currency}>₱</Text>
              <Text style={styles.priceValue}>{currentPrice}</Text>
              <Text style={styles.priceUnit}>/kg</Text>
            </View>
            <Text style={styles.priceAsOf}>as of {asOfText}</Text>
          </View>
          <View style={styles.priceChangeCol}>
            <View style={[styles.changeBadge, Number(periodChange) >= 0 ? styles.changeUp : styles.changeDown]}>
              <Ionicons
                name={Number(periodChange) >= 0 ? 'trending-up' : 'trending-down'}
                size={16}
                color={Number(periodChange) >= 0 ? '#16A34A' : '#DC2626'}
              />
              <Text style={[styles.changeText, Number(periodChange) >= 0 ? styles.changeTextUp : styles.changeTextDown]}>
                {Number(periodChange) >= 0 ? '+' : ''}{periodChange}%
              </Text>
            </View>
            <Text style={styles.changeLabel}>this period</Text>
          </View>
        </View>

        {/* Forecast strip */}
        <View style={styles.forecastStrip}>
          <View style={styles.forecastItem}>
            <Ionicons name="analytics-outline" size={16} color="rgba(255,255,255,0.7)" />
            <Text style={styles.forecastLabel}>Forecast</Text>
          </View>
          <Text style={styles.forecastValue}>₱{predictedPrice}</Text>
          <View style={[styles.forecastBadge, Number(priceChange) >= 0 ? styles.forecastBadgeUp : styles.forecastBadgeDown]}>
            <Text style={[styles.forecastBadgeText, Number(priceChange) >= 0 ? { color: '#16A34A' } : { color: '#DC2626' }]}>
              {Number(priceChange) >= 0 ? '▲' : '▼'} {Math.abs(Number(priceChange))}%
            </Text>
          </View>
          <Text style={styles.forecastPeriod}>
            {forecastDesc}
            {dataSource === 'db+model' ? ' · live' : ''}
          </Text>
        </View>
      </View>

      {/* ── Quick Stats Row ───────────────────────────────── */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>High</Text>
          <Text style={[styles.statValue, { color: '#16A34A' }]}>₱{highPrice}</Text>
        </View>
        <View style={[styles.statItem, styles.statDivider]}>
          <Text style={styles.statLabel}>Low</Text>
          <Text style={[styles.statValue, { color: '#DC2626' }]}>₱{lowPrice}</Text>
        </View>
        <View style={[styles.statItem, styles.statDivider]}>
          <Text style={styles.statLabel}>Average</Text>
          <Text style={styles.statValue}>₱{avgPrice}</Text>
        </View>
        <View style={[styles.statItem, styles.statDivider]}>
          <Text style={styles.statLabel}>Points</Text>
          <Text style={styles.statValue}>{data.length}</Text>
        </View>
        {isLoading && (
          <ActivityIndicator size="small" color={COLORS.primary} style={{ marginLeft: 8 }} />
        )}
      </View>

      {/* ── Chart Card ────────────────────────────────────── */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartTitle}>Price Trend</Text>
            <Text style={styles.chartSubtitle}>
              {selectedPoint != null && selectedPoint < allData.length
                ? `${allData[selectedPoint].date} — ₱${allData[selectedPoint].price}/kg${selectedPoint >= data.length ? ' (forecast)' : ''}`
                : 'Tap a point for details · Historical + Forecast'}
            </Text>
          </View>
        </View>

        {/* Scrollable timeframe pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeframeScroll} contentContainerStyle={styles.timeframeScrollContent}>
          {timeframes.map(tf => (
            <TouchableOpacity
              key={tf.key}
              style={[styles.timeframePill, timeframe === tf.key && styles.timeframePillActive]}
              onPress={() => handleTimeframeChange(tf.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.timeframePillText, timeframe === tf.key && styles.timeframePillTextActive]}>
                {tf.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Legend */}
        <View style={styles.chartLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: COLORS.primary }]} />
            <Text style={styles.legendText}>Actual</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendLineDashed, { borderColor: '#94A3B8' }]} />
            <Text style={styles.legendText}>Forecast</Text>
          </View>
        </View>

        {/* SVG chart with fade animation */}
        <Animated.View style={[styles.chartContainer, { opacity: chartFadeAnim }]}>
          <LineChart
            data={data}
            forecast={forecast}
            width={chartWidth}
            height={220}
            primaryColor={COLORS.primary}
            forecastColor="#94A3B8"
            bgColor={COLORS.surface}
            textColor={COLORS.textSecondary}
            gridColor={COLORS.divider}
            selectedIndex={selectedPoint}
            onSelectPoint={setSelectedPoint}
          />
        </Animated.View>
      </View>

      {/* ── Seasonal Pattern ─────────────────────────────── */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartTitle}>Seasonal Price Pattern</Text>
            <Text style={styles.chartSubtitle}>Avg range per month (₱/kg) — horizontal line = average</Text>
          </View>
        </View>
        <View style={styles.chartContainer}>
          <SeasonalChart
            data={seasonalData}
            width={chartWidth}
            height={130}
            primaryColor={COLORS.primary}
            textColor={COLORS.textSecondary}
            gridColor={COLORS.divider}
            bgColor={COLORS.surface}
          />
        </View>
        <View style={styles.seasonalNotes}>
          <View style={styles.seasonalNote}>
            <Ionicons name="arrow-down-circle" size={14} color="#16A34A" />
            <Text style={styles.seasonalNoteText}>Lowest: Mar–May (harvest season, ₱95–150/kg)</Text>
          </View>
          <View style={styles.seasonalNote}>
            <Ionicons name="arrow-up-circle" size={14} color="#DC2626" />
            <Text style={styles.seasonalNoteText}>Highest: Aug–Oct (off-season, ₱175–215/kg)</Text>
          </View>
        </View>
      </View>

      {/* ── Market Prices Table ───────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Market Prices</Text>
          <Text style={styles.sectionDate}>Feb 2026</Text>
        </View>
        <View style={styles.pricesCard}>
          {/* Table header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 1 }]}>Product</Text>
            <Text style={[styles.tableHeaderText, { width: 80, textAlign: 'right' }]}>Price</Text>
            <Text style={[styles.tableHeaderText, { width: 60, textAlign: 'right' }]}>Change</Text>
          </View>
          {productPrices.map((product, index) => {
            const change = product.prevPrice > 0
              ? ((product.price - product.prevPrice) / product.prevPrice * 100).toFixed(1)
              : '0.0';
            return (
              <View
                key={product.name}
                style={[styles.priceRow, index < productPrices.length - 1 && styles.priceRowBorder]}
              >
                <View style={styles.priceRowLeft}>
                  <Text style={styles.productEmoji}>{product.emoji}</Text>
                  <View>
                    <Text style={styles.productName}>{product.name}</Text>
                    <Text style={styles.productUnit}>{product.unit}</Text>
                  </View>
                </View>
                <Text style={styles.productPrice}>₱{product.price}</Text>
                <View style={[
                  styles.miniChangeBadge,
                  Number(change) > 0 ? styles.miniChangeUp : Number(change) < 0 ? styles.miniChangeDown : styles.miniChangeNeutral
                ]}>
                  <Text style={[
                    styles.miniChangeText,
                    Number(change) > 0 ? styles.changeTextUp : Number(change) < 0 ? styles.changeTextDown : styles.changeTextNeutral
                  ]}>
                    {Number(change) > 0 ? '+' : ''}{change}%
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* ── Market Insights (expandable) ──────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Market Insights</Text>
        {marketInsights.map(insight => {
          const isExpanded = expandedInsight === insight.id;
          return (
            <TouchableOpacity
              key={insight.id}
              style={styles.insightCard}
              onPress={() => toggleInsight(insight.id)}
              activeOpacity={0.75}
            >
              <View style={styles.insightIcon}>
                <Text style={styles.insightEmoji}>{insight.icon}</Text>
              </View>
              <View style={styles.insightContent}>
                <View style={styles.insightHeader}>
                  <Text style={styles.insightTitle}>{insight.title}</Text>
                  <View style={styles.insightHeaderRight}>
                    <View style={[styles.trendPill, insight.trend === 'up' ? styles.trendPillUp : styles.trendPillDown]}>
                      <Ionicons
                        name={insight.trend === 'up' ? 'arrow-up' : 'arrow-down'}
                        size={10}
                        color={insight.trend === 'up' ? '#16A34A' : '#DC2626'}
                      />
                    </View>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={COLORS.textLight}
                    />
                  </View>
                </View>
                {isExpanded && (
                  <View>
                    <Text style={styles.insightDescription}>{insight.description}</Text>
                    <Text style={styles.insightDate}>{insight.date}</Text>
                  </View>
                )}
                {!isExpanded && (
                  <Text style={styles.insightPreview} numberOfLines={1}>{insight.description}</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Disclaimer ────────────────────────────────────── */}
      <View style={styles.disclaimer}>
        <Ionicons name="information-circle-outline" size={16} color={COLORS.textLight} />
        <Text style={styles.disclaimerText}>
          Prices are based on DTI-SRP, DA Bantay-Presyo, and local market surveys. Forecasts use historical
          seasonal patterns and are estimates only — actual prices may vary by region and quality grade.
        </Text>
      </View>
    </ScrollView>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
//  Styles
// ──────────────────────────────────────────────────────────────────────────────
const createStyles = (COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ── Price Card ──
  priceCard: {
    backgroundColor: COLORS.primary,
    margin: 16,
    marginBottom: 0,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  priceCardTop: {
    flexDirection: 'row',
    padding: 22,
    paddingBottom: 16,
  },
  liveBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(22,163,74,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
  },
  liveText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#4ADE80',
    letterSpacing: 0.5,
  },
  priceLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  priceMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  currency: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  priceValue: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
    marginLeft: 2,
    letterSpacing: -1,
  },
  priceUnit: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    marginLeft: 4,
    fontWeight: '500',
  },
  priceAsOf: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
  priceChangeCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  changeUp: { backgroundColor: 'rgba(22,163,74,0.2)' },
  changeDown: { backgroundColor: 'rgba(220,38,38,0.2)' },
  changeText: { fontSize: 14, fontWeight: '700' },
  changeTextUp: { color: '#4ADE80' },
  changeTextDown: { color: '#FCA5A5' },
  changeTextNeutral: { color: COLORS.textSecondary },
  changeLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },

  // Forecast strip
  forecastStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 10,
  },
  forecastItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  forecastLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
  },
  forecastValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  forecastBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  forecastBadgeUp: { backgroundColor: 'rgba(22,163,74,0.25)' },
  forecastBadgeDown: { backgroundColor: 'rgba(220,38,38,0.25)' },
  forecastBadgeText: { fontSize: 11, fontWeight: '700' },
  forecastPeriod: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    marginLeft: 'auto',
  },

  // ── Stats Row ──
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    borderLeftWidth: 1,
    borderLeftColor: COLORS.divider,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },

  // ── Chart Card ──
  chartCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  chartSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // Scrollable timeframe pills
  timeframeScroll: {
    marginBottom: 10,
    marginHorizontal: -4,
  },
  timeframeScrollContent: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 4,
  },
  timeframePill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  timeframePillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  timeframePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  timeframePillTextActive: {
    color: COLORS.textOnPrimary,
  },

  // Legacy toggle (unused but kept for compat)
  timeframeToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 3,
  },
  timeframeButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  timeframeActive: {
    backgroundColor: COLORS.primary,
  },
  timeframeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  timeframeTextActive: {
    color: COLORS.textOnPrimary,
  },
  chartLegend: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendLine: {
    width: 18,
    height: 3,
    borderRadius: 2,
  },
  legendLineDashed: {
    width: 18,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
  },
  legendDash: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: '#94A3B8',
    borderRadius: 2,
  },
  legendText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  chartContainer: {
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: 12,
  },

  // Seasonal notes
  seasonalNotes: {
    marginTop: 12,
    gap: 6,
  },
  seasonalNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  seasonalNoteText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    flex: 1,
  },

  // ── Section ──
  section: {
    marginTop: 8,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.2,
    marginBottom: 10,
  },
  sectionDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },

  // ── Prices Table ──
  pricesCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: COLORS.surfaceVariant,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  priceRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  priceRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  productEmoji: {
    fontSize: 20,
  },
  productName: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  productUnit: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 1,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
    width: 80,
    textAlign: 'right',
  },
  miniChangeBadge: {
    width: 58,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
    marginLeft: 8,
  },
  miniChangeUp: { backgroundColor: 'rgba(22,163,74,0.1)' },
  miniChangeDown: { backgroundColor: 'rgba(220,38,38,0.1)' },
  miniChangeNeutral: { backgroundColor: COLORS.surfaceVariant },
  miniChangeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Insights ──
  insightCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  insightIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  insightEmoji: {
    fontSize: 22,
  },
  insightContent: {
    flex: 1,
  },
  insightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  insightHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  trendPill: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendPillUp: { backgroundColor: 'rgba(22,163,74,0.12)' },
  trendPillDown: { backgroundColor: 'rgba(220,38,38,0.12)' },
  insightDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
  },
  insightPreview: {
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 17,
  },
  insightDate: {
    fontSize: 10,
    color: COLORS.textLight,
    marginTop: 6,
    fontWeight: '500',
  },

  // ── Disclaimer ──
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 8,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 11,
    color: COLORS.textLight,
    lineHeight: 17,
  },
});
