import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet,
  ScrollView, ActivityIndicator, Alert, TextInput, Modal
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_BASE = 'https://guinness-g-api-production.up.railway.app';
const API_URL = `${API_BASE}/analyze`;

// --- Star Rating Component ---
const StarRating = ({ rating, onRate, size = 28 }) => (
  <View style={{ flexDirection: 'row', gap: 6, marginVertical: 6 }}>
    {[1, 2, 3, 4, 5].map(star => (
      <TouchableOpacity key={star} onPress={() => onRate && onRate(star)}
        disabled={!onRate}>
        <Text style={{ fontSize: size, opacity: star <= rating ? 1 : 0.25 }}>⭐</Text>
      </TouchableOpacity>
    ))}
  </View>
);

// --- Visual Indicator ---
const GVisualIndicator = ({ gMidpointPct, beerLinePct }) => {
  const BAR_HEIGHT = 200;
  const gPos = BAR_HEIGHT * (1 - gMidpointPct / 100);
  const beerPos = BAR_HEIGHT * (1 - beerLinePct / 100);
  const gHeight = BAR_HEIGHT * 0.08;
  return (
    <View style={indicator.container}>
      <Text style={indicator.label}>Glass Top</Text>
      <View style={indicator.bar}>
        <View style={[indicator.gZone, { top: gPos - gHeight, height: gHeight * 2 }]}>
          <Text style={indicator.gLetter}>G</Text>
        </View>
        <View style={[indicator.perfectZone, { top: gPos - 4, height: 8 }]} />
        <View style={[indicator.midLine, { top: gPos }]} />
        <View style={[indicator.beerLine, { top: beerPos }]}>
          <Text style={indicator.beerLabel}>🍺 beer line</Text>
        </View>
      </View>
      <Text style={indicator.label}>Glass Bottom</Text>
      <View style={indicator.legend}>
        <View style={indicator.legendItem}>
          <View style={[indicator.legendDot, { backgroundColor: '#FDB913' }]} />
          <Text style={indicator.legendText}>G midpoint (target)</Text>
        </View>
        <View style={indicator.legendItem}>
          <View style={[indicator.legendDot, { backgroundColor: '#4fc3f7' }]} />
          <Text style={indicator.legendText}>Your beer line</Text>
        </View>
        <View style={indicator.legendItem}>
          <View style={[indicator.legendDot, { backgroundColor: 'rgba(100,255,100,0.5)' }]} />
          <Text style={indicator.legendText}>Perfect zone</Text>
        </View>
      </View>
    </View>
  );
};

// --- Rank Badge ---
const RankBadge = ({ index }) => {
  const labels = ['🥇', '🥈', '🥉'];
  const label = index < 3 ? labels[index] : `#${index + 1}`;
  const color = index === 0 ? '#FDB913' : index === 1 ? '#ccc' : index === 2 ? '#cd7f32' : '#888';
  return (
    <Text style={{ fontSize: index < 3 ? 22 : 14, color, width: 36, textAlign: 'center' }}>
      {label}
    </Text>
  );
};

// --- Main App ---
export default function App() {
  const [screen, setScreen] = useState('login');
  const [username, setUsername] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [profile, setProfile] = useState(null);
  const [profilePours, setProfilePours] = useState([]);
  const [image, setImage] = useState(null);
  const [freshPhotoUri, setFreshPhotoUri] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [bars, setBars] = useState([]);
  const [activeTab, setActiveTab] = useState('camera');

  // Pour flow state
  const [pourStep, setPourStep] = useState('idle'); // idle | fresh | rating | sip | result
  const [showBarModal, setShowBarModal] = useState(false);
  const [barName, setBarName] = useState('');
  const [barRating, setBarRating] = useState(0);
  const [pendingScore, setPendingScore] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('username').then(u => {
      if (u) {
        setUsername(u);
        loadProfile(u);
        loadProfilePours(u);
        setScreen('main');
      }
    });
  }, []);

  const loadProfile = async (name) => {
    try {
      const { data } = await axios.get(`${API_BASE}/profile/${name}`);
      if (!data.error) setProfile(data);
    } catch (e) { console.log('Profile load failed:', e); }
  };

  const loadProfilePours = async (name) => {
    try {
      const { data } = await axios.get(`${API_BASE}/profile/${name}/pours`);
      setProfilePours(data);
    } catch (e) { console.log('Profile pours load failed:', e); }
  };

  const handleLogin = async () => {
    if (!usernameInput.trim()) return;
    setProfileLoading(true);
    try {
      const { data } = await axios.post(`${API_BASE}/profile`, {
        username: usernameInput.trim()
      });
      if (data.error) { Alert.alert('Error', data.error); setProfileLoading(false); return; }
      const name = data.username;
      await AsyncStorage.setItem('username', name);
      setUsername(name);
      await loadProfile(name);
      await loadProfilePours(name);
      await loadHistory(name);
      await fetchLeaderboard();
      await fetchBars();
      Alert.alert(data.status === 'created' ? '👋 Welcome!' : '🍺 Welcome Back!', data.message);
      setScreen('main');
    } catch (e) {
      Alert.alert('Error', 'Could not connect to server.');
    }
    setProfileLoading(false);
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel' },
      {
        text: 'Log Out', onPress: async () => {
          await AsyncStorage.removeItem('username');
          setUsername(''); setProfile(null); setProfilePours([]);
          setHistory([]); setResult(null); setImage(null);
          setFreshPhotoUri(null); setUsernameInput('');
          setPourStep('idle'); setScreen('login');
        }
      }
    ]);
  };

  const loadHistory = async (name) => {
    const stored = await AsyncStorage.getItem(`pours_${name}`);
    if (stored) setHistory(JSON.parse(stored));
  };

  const saveScore = async (distance_cm, desc, bar, rating, freshUri) => {
    const entry = {
      score: distance_cm, desc, bar_name: bar,
      bar_rating: rating, fresh_photo_uri: freshUri,
      date: new Date().toLocaleString()
    };
    const updated = [entry, ...history];
    setHistory(updated);
    await AsyncStorage.setItem(`pours_${username}`, JSON.stringify(updated));
    try {
      await axios.post(`${API_BASE}/scores`, {
        username, distance_cm, description: desc,
        bar_name: bar, bar_rating: rating, fresh_photo_uri: freshUri
      });
    } catch (e) { console.log('Score submit failed:', e); }
    await fetchLeaderboard();
    await fetchBars();
    await loadProfile(username);
    await loadProfilePours(username);
  };

  const fetchLeaderboard = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/leaderboard`);
      setLeaderboard(data);
    } catch (e) { console.log('Leaderboard fetch failed:', e); }
  };

  const fetchBars = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/bars`);
      setBars(data);
    } catch (e) { console.log('Bars fetch failed:', e); }
  };

  const clearHistory = async () => {
    Alert.alert('Clear History', 'Are you sure?', [
      { text: 'Cancel' },
      {
        text: 'Clear', onPress: async () => {
          setHistory([]);
          await AsyncStorage.removeItem(`pours_${username}`);
        }
      }
    ]);
  };

  const average = history.filter(h => h.score != null).length
    ? (history.filter(h => h.score != null)
        .reduce((a, b) => a + b.score, 0) /
       history.filter(h => h.score != null).length).toFixed(1)
    : null;

  // ── STEP 1: Take fresh pint photo ──
  const startNewPour = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is needed!');
        return;
      }
      setPourStep('fresh');
      const pic = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'], quality: 0.8,
      });
      if (!pic.canceled) {
        const uri = pic.assets[0].uri;
        setFreshPhotoUri(uri);
        setImage(null);
        setResult(null);
        setBarName('');
        setBarRating(0);
        setPourStep('rating');
        setShowBarModal(true);
      } else {
        setPourStep('idle');
      }
    } catch (e) {
      Alert.alert('Camera Error', e.message);
      setPourStep('idle');
    }
  };

  // ── STEP 2: Bar modal submit ──
  const handleBarSubmit = () => {
    if (!barName.trim()) { Alert.alert('Bar Name Required', 'Enter the bar name!'); return; }
    if (barRating === 0) { Alert.alert('Rating Required', 'Please rate your Guinness!'); return; }
    setShowBarModal(false);
    Alert.alert(
      '📏 Measure Your Split?',
      'Take a sip then photograph the glass to measure your Split the G score.',
      [
        { text: 'Skip for now', onPress: () => handleSaveWithoutScore() },
        { text: 'Take Sip Photo', onPress: () => takeSipPhoto() }
      ]
    );
  };

  const handleBarSkip = () => {
    setShowBarModal(false);
    handleSaveWithoutScore();
  };

  // ── STEP 3A: Save without G score ──
  const handleSaveWithoutScore = async () => {
    await saveScore(null, 'No G score recorded', barName.trim(), barRating, freshPhotoUri);
    setPourStep('idle');
  };

  // ── STEP 3B: Take sip photo and analyze ──
  const takeSipPhoto = async () => {
    try {
      setPourStep('sip');
      const pic = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'], quality: 0.8,
      });
      if (!pic.canceled) {
        const uri = pic.assets[0].uri;
        setImage(uri);
        setLoading(true);
        setPourStep('result');

        const formData = new FormData();
        formData.append('file', { uri, name: 'pint.jpg', type: 'image/jpeg' });

        try {
          const { data } = await axios.post(API_URL, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          setResult(data);
          if (data.glass_detected && data.g_detected && data.beer_present) {
            await saveScore(
              data.distance_cm, data.description,
              barName.trim(), barRating, freshPhotoUri
            );
          }
        } catch (e) {
          Alert.alert('Error', 'Analysis failed. Check your connection.');
        }
        setLoading(false);
      } else {
        setPourStep('idle');
      }
    } catch (e) {
      Alert.alert('Camera Error', e.message);
      setPourStep('idle');
    }
  };

  // --- Login Screen ---
  if (screen === 'login') {
    return (
      <View style={styles.loginContainer}>
        <Text style={styles.title}>🍺 Split the G</Text>
        <Text style={styles.loginSubtitle}>
          Track your pours, rate your pints, and compete with friends
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your name..."
          placeholderTextColor="#555"
          value={usernameInput}
          onChangeText={setUsernameInput}
          autoCapitalize="words"
          onSubmitEditing={handleLogin}
          returnKeyType="go"
        />
        <TouchableOpacity
          style={[styles.button, (!usernameInput.trim() || profileLoading) && { opacity: 0.4 }]}
          disabled={!usernameInput.trim() || profileLoading}
          onPress={handleLogin}>
          {profileLoading
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.buttonText}>Let's Pour 🍺</Text>}
        </TouchableOpacity>
        <Text style={styles.loginNote}>No password needed — just pick a unique name!</Text>
      </View>
    );
  }

  // --- Main App ---
  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>

      {/* Bar Rating Modal */}
      <Modal visible={showBarModal} transparent animationType="slide"
        onRequestClose={() => setShowBarModal(false)}>
        <View style={modal.overlay}>
          <View style={modal.sheet}>
            <Text style={modal.title}>🍺 How was that pint?</Text>
            <Text style={modal.subtitle}>Tag the bar and rate your Guinness</Text>

            {/* Fresh photo preview */}
            {freshPhotoUri && (
              <Image source={{ uri: freshPhotoUri }} style={modal.preview} />
            )}

            <Text style={modal.label}>Bar Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. The Dead Rabbit, Mulligan's..."
              placeholderTextColor="#555"
              value={barName}
              onChangeText={setBarName}
              autoCapitalize="words"
            />

            <Text style={modal.label}>Your Rating</Text>
            <StarRating rating={barRating} onRate={setBarRating} />

            {barRating > 0 && (
              <Text style={modal.ratingDesc}>
                {barRating === 1 ? '😬 Terrible pint' :
                 barRating === 2 ? '😐 Below average' :
                 barRating === 3 ? '👍 Decent pint' :
                 barRating === 4 ? '😎 Great pint!' :
                 '🎯 Perfect pint!'}
              </Text>
            )}

            <TouchableOpacity
              style={[styles.button, { width: '100%', alignItems: 'center', marginTop: 16 }]}
              onPress={handleBarSubmit}>
              <Text style={styles.buttonText}>Next →</Text>
            </TouchableOpacity>

            <TouchableOpacity style={modal.skipBtn} onPress={handleBarSkip}>
              <Text style={modal.skipText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>🍺 Split the G</Text>
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutBtn}>Log Out</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          {[
            { key: 'camera', label: '📸 Pour' },
            { key: 'bars',   label: '🍻 Bars' },
            { key: 'profile', label: '👤 Me' },
            { key: 'leaderboard', label: '🏆 Board' },
          ].map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.activeTab]}
              onPress={() => {
                setActiveTab(tab.key);
                if (tab.key === 'leaderboard') fetchLeaderboard();
                if (tab.key === 'bars') fetchBars();
                if (tab.key === 'profile') {
                  loadProfile(username);
                  loadProfilePours(username);
                }
              }}>
              <Text style={styles.tabText}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── POUR TAB ── */}
        {activeTab === 'camera' && (
          <>
            <Text style={styles.greeting}>Hey {username} 👋</Text>

            {average && (
              <View style={styles.avgBox}>
                <Text style={styles.avgLabel}>YOUR AVERAGE G SCORE</Text>
                <Text style={styles.avgValue}>{average}cm off perfect</Text>
              </View>
            )}

            {/* New Pint Button */}
            {pourStep === 'idle' && (
              <TouchableOpacity style={styles.button} onPress={startNewPour}>
                <Text style={styles.buttonText}>📸 New Pint</Text>
              </TouchableOpacity>
            )}

            {/* Step indicators */}
            {pourStep === 'fresh' && (
              <View style={styles.stepBox}>
                <ActivityIndicator color="#FDB913" />
                <Text style={styles.stepText}>Step 1: Taking fresh pint photo...</Text>
              </View>
            )}
            {pourStep === 'sip' && (
              <View style={styles.stepBox}>
                <ActivityIndicator color="#FDB913" />
                <Text style={styles.stepText}>Step 3: Take your sip photo...</Text>
              </View>
            )}

            {loading && (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#FDB913" />
                <Text style={styles.loadingText}>Analyzing your split...</Text>
              </View>
            )}

            {/* Fresh photo preview */}
            {freshPhotoUri && pourStep === 'result' && (
              <View style={styles.photoRow}>
                <View style={styles.photoCard}>
                  <Text style={styles.photoLabel}>Fresh Pint 📷</Text>
                  <Image source={{ uri: freshPhotoUri }} style={styles.photoThumb} />
                </View>
                {image && (
                  <View style={styles.photoCard}>
                    <Text style={styles.photoLabel}>After Sip 📷</Text>
                    <Image source={{ uri: image }} style={styles.photoThumb} />
                  </View>
                )}
              </View>
            )}

            {/* Result */}
            {result && pourStep === 'result' && (
              <View style={styles.resultBox}>
                {!result.glass_detected && (
                  <Text style={styles.warn}>⚠️ No Guinness detected. Try again!</Text>
                )}
                {result.glass_detected && !result.beer_present && (
                  <Text style={styles.warn}>🫗 Glass looks empty — fill it up!</Text>
                )}
                {result.glass_detected && !result.g_detected && result.beer_present && (
                  <Text style={styles.warn}>⚠️ Couldn't find the G — show the label!</Text>
                )}
                {result.glass_detected && result.g_detected && result.beer_present && (
                  <>
                    <Text style={styles.score}>
                      {result.distance_cm === 0
                        ? '🎯 PERFECT SPLIT!'
                        : result.distance_cm <= 0.5
                        ? `😎 ${result.distance_cm.toFixed(1)}cm off — so close!`
                        : result.distance_cm <= 1.5
                        ? `👍 ${result.distance_cm.toFixed(1)}cm off — not bad!`
                        : `😬 ${result.distance_cm.toFixed(1)}cm off — keep practicing!`}
                    </Text>
                    <Text style={styles.position}>
                      Beer line: {result.beer_line_position?.replace(/_/g, ' ')}
                    </Text>
                    <Text style={styles.desc}>{result.description}</Text>
                    <GVisualIndicator
                      gMidpointPct={result.g_midpoint_pct}
                      beerLinePct={result.beer_line_pct}
                    />
                  </>
                )}
                <TouchableOpacity
                  style={[styles.button, { marginTop: 16 }]}
                  onPress={() => { setPourStep('idle'); setResult(null); setImage(null); setFreshPhotoUri(null); }}>
                  <Text style={styles.buttonText}>New Pour</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* History */}
            {history.length > 0 && pourStep === 'idle' && (
              <>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>📊 Recent Pours</Text>
                  <TouchableOpacity onPress={clearHistory}>
                    <Text style={styles.clearBtn}>Clear</Text>
                  </TouchableOpacity>
                </View>
                {history.slice(0, 5).map((h, i) => (
                  <View key={i} style={styles.historyItem}>
                    <View style={styles.historyTop}>
                      {h.fresh_photo_uri
                        ? <Image source={{ uri: h.fresh_photo_uri }} style={styles.historyThumb} />
                        : <View style={[styles.historyThumb, { backgroundColor: '#2a2a2a', justifyContent: 'center', alignItems: 'center' }]}>
                            <Text>🍺</Text>
                          </View>
                      }
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        {h.score != null
                          ? <Text style={styles.historyScore}>{h.score.toFixed(1)}cm off</Text>
                          : <Text style={styles.historyScore}>No G score</Text>}
                        {h.bar_name && h.bar_name !== 'Unknown Bar' && (
                          <Text style={styles.historyBar}>📍 {h.bar_name}</Text>
                        )}
                        {h.bar_rating > 0 && <StarRating rating={h.bar_rating} size={12} />}
                        <Text style={styles.historyDate}>{h.date}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* ── BARS TAB ── */}
        {activeTab === 'bars' && (
          <>
            <Text style={styles.leaderboardTitle}>🍻 Bar Rankings</Text>
            <Text style={styles.leaderboardSub}>Rated by the Split the G community</Text>
            {bars.length === 0 && (
              <Text style={styles.emptyText}>No bars rated yet — tag a bar on your next pour!</Text>
            )}
            {bars.map((bar, i) => (
              <View key={i} style={styles.barItem}>
                <View style={styles.barRank}>
                  <Text style={styles.barRankNum}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                  </Text>
                </View>
                <View style={styles.barInfo}>
                  <Text style={styles.barName}>{bar.bar_name}</Text>
                  <View style={styles.barStars}>
                    <StarRating rating={Math.round(bar.avg_rating)} size={14} />
                    <Text style={styles.barRatingText}>
                      {bar.avg_rating?.toFixed(1)} · {bar.total_pours} pour{bar.total_pours !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <Text style={styles.barVisitors}>
                    👥 {bar.unique_visitors} visitor{bar.unique_visitors !== 1 ? 's' : ''} · avg {bar.avg_cm}cm off split
                  </Text>
                </View>
              </View>
            ))}
            <TouchableOpacity style={styles.refreshBtn} onPress={fetchBars}>
              <Text style={styles.refreshText}>🔄 Refresh</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── PROFILE TAB ── */}
        {activeTab === 'profile' && (
          <>
            {/* Header */}
            <View style={styles.profileHeader}>
              <Text style={styles.profileAvatar}>🍺</Text>
              <Text style={styles.profileName}>{username}</Text>
              <Text style={styles.profileJoined}>
                Joined {profile?.created_at?.slice(0, 10) || 'today'}
              </Text>
            </View>

            {/* Stats grid */}
            {profile && (
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{profile.total_pours}</Text>
                  <Text style={styles.statLabel}>Total Pours</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{profile.avg_cm ?? '—'}cm</Text>
                  <Text style={styles.statLabel}>Avg G Score</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>
                    {'⭐'.repeat(profile.best_rating || 0) || '—'}
                  </Text>
                  <Text style={styles.statLabel}>Best Rating</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>
                    {'⭐'.repeat(profile.worst_rating || 0) || '—'}
                  </Text>
                  <Text style={styles.statLabel}>Worst Rating</Text>
                </View>
              </View>
            )}

            {/* Pour list sorted by star rating */}
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>🍺 My Pours</Text>
              <Text style={styles.sortLabel}>⭐ best → worst</Text>
            </View>
            <Text style={styles.tiebreakNote}>Tiebreak: lower cm off ranks higher</Text>

            {profilePours.length === 0 && (
              <Text style={styles.emptyText}>No pours yet — start with a new pint!</Text>
            )}

            {profilePours.map((pour, i) => (
              <View key={i} style={styles.pourCard}>
                {/* Rank */}
                <RankBadge index={i} />

                {/* Fresh photo thumbnail */}
                {pour.fresh_photo_uri
                  ? <Image source={{ uri: pour.fresh_photo_uri }} style={styles.pourThumb} />
                  : <View style={[styles.pourThumb, { backgroundColor: '#2a2a2a', justifyContent: 'center', alignItems: 'center' }]}>
                      <Text style={{ fontSize: 24 }}>🍺</Text>
                    </View>
                }

                {/* Details */}
                <View style={{ flex: 1, marginLeft: 10 }}>
                  {/* Stars — primary sort */}
                  <StarRating rating={pour.bar_rating || 0} size={16} />

                  {/* G score — tiebreaker */}
                  <Text style={styles.pourScore}>
                    {pour.distance_cm != null
                      ? `📏 ${pour.distance_cm.toFixed(1)}cm off`
                      : '📏 No G score'}
                  </Text>

                  {/* Bar */}
                  {pour.bar_name && pour.bar_name !== 'Unknown Bar' && (
                    <Text style={styles.pourBar}>📍 {pour.bar_name}</Text>
                  )}

                  {/* Date */}
                  <Text style={styles.pourDate}>{pour.timestamp?.slice(0, 10)}</Text>
                </View>
              </View>
            ))}

            <TouchableOpacity style={styles.logoutFullBtn} onPress={handleLogout}>
              <Text style={styles.logoutFullText}>Log Out</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── LEADERBOARD TAB ── */}
        {activeTab === 'leaderboard' && (
          <>
            <Text style={styles.leaderboardTitle}>🏆 Global Leaderboard</Text>
            <Text style={styles.leaderboardSub}>Ranked by average cm from perfect</Text>
            {leaderboard.length === 0 && (
              <Text style={styles.emptyText}>No scores yet — be the first!</Text>
            )}
            {leaderboard.map((entry, i) => (
              <View key={i} style={[
                styles.leaderItem,
                entry.username === username && styles.leaderItemMe
              ]}>
                <Text style={styles.leaderRank}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </Text>
                <View style={styles.leaderInfo}>
                  <Text style={styles.leaderName}>
                    {entry.username}{entry.username === username ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.leaderStats}>
                    {entry.total_pours} pour{entry.total_pours !== 1 ? 's' : ''} · Best: {entry.best_pour}cm
                  </Text>
                </View>
                <Text style={styles.leaderScore}>{entry.avg_cm}cm</Text>
              </View>
            ))}
            <TouchableOpacity style={styles.refreshBtn} onPress={fetchLeaderboard}>
              <Text style={styles.refreshText}>🔄 Refresh</Text>
            </TouchableOpacity>
          </>
        )}

      </ScrollView>
    </View>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  content: { padding: 24, alignItems: 'center', paddingBottom: 60 },
  loginContainer: {
    flex: 1, backgroundColor: '#0a0a0a',
    alignItems: 'center', justifyContent: 'center', padding: 32
  },
  title: { fontSize: 32, fontWeight: 'bold', color: '#FDB913', marginBottom: 8 },
  loginSubtitle: { color: '#888', fontSize: 15, textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  loginNote: { color: '#444', fontSize: 13, marginTop: 16, textAlign: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', width: '100%', marginTop: 50, marginBottom: 8
  },
  logoutBtn: { color: '#888', fontSize: 14 },
  greeting: { color: '#888', fontSize: 16, marginBottom: 16 },
  avgBox: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16,
    alignItems: 'center', marginBottom: 24, width: '100%'
  },
  avgLabel: { color: '#888', fontSize: 12, letterSpacing: 2 },
  avgValue: { color: '#FDB913', fontSize: 28, fontWeight: 'bold' },
  button: {
    backgroundColor: '#FDB913', borderRadius: 12,
    paddingVertical: 16, paddingHorizontal: 40, marginBottom: 24
  },
  buttonText: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  stepBox: { alignItems: 'center', marginBottom: 16 },
  stepText: { color: '#FDB913', marginTop: 8, fontSize: 14 },
  loadingBox: { alignItems: 'center', marginBottom: 16 },
  loadingText: { color: '#FDB913', marginTop: 8 },
  photoRow: { flexDirection: 'row', gap: 12, marginBottom: 16, width: '100%' },
  photoCard: { flex: 1, alignItems: 'center' },
  photoLabel: { color: '#888', fontSize: 11, marginBottom: 4 },
  photoThumb: { width: '100%', height: 180, borderRadius: 10 },
  image: { width: 300, height: 400, borderRadius: 12, marginBottom: 16 },
  resultBox: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16,
    alignItems: 'center', width: '100%', marginBottom: 24
  },
  score: { fontSize: 22, color: '#FDB913', fontWeight: 'bold', marginBottom: 8 },
  position: { color: '#aaa', fontSize: 14, marginBottom: 4 },
  desc: { color: '#fff', fontSize: 14, textAlign: 'center' },
  warn: { color: '#ff6b6b', fontSize: 16, textAlign: 'center' },
  historyHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', width: '100%', marginBottom: 4
  },
  historyTitle: { color: '#FDB913', fontSize: 20, fontWeight: 'bold' },
  sortLabel: { color: '#FDB913', fontSize: 12 },
  tiebreakNote: { color: '#555', fontSize: 11, alignSelf: 'flex-start', marginBottom: 12 },
  clearBtn: { color: '#ff6b6b', fontSize: 14 },
  historyItem: {
    backgroundColor: '#1a1a1a', borderRadius: 8,
    padding: 12, width: '100%', marginBottom: 8
  },
  historyTop: { flexDirection: 'row', alignItems: 'center' },
  historyThumb: { width: 52, height: 52, borderRadius: 8 },
  historyScore: { color: '#FDB913', fontSize: 15, fontWeight: 'bold' },
  historyBar: { color: '#4fc3f7', fontSize: 12, marginTop: 2 },
  historyDate: { color: '#888', fontSize: 11, marginTop: 2 },
  pourCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 10,
    padding: 12, marginBottom: 10, width: '100%'
  },
  pourThumb: { width: 64, height: 64, borderRadius: 8, marginLeft: 8 },
  pourScore: { color: '#aaa', fontSize: 13, marginTop: 2 },
  pourBar: { color: '#4fc3f7', fontSize: 12, marginTop: 2 },
  pourDate: { color: '#555', fontSize: 11, marginTop: 2 },
  tabBar: { flexDirection: 'row', marginBottom: 24, width: '100%' },
  tab: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: '#333'
  },
  activeTab: { borderBottomColor: '#FDB913' },
  tabText: { color: '#fff', fontSize: 13 },
  input: {
    width: '100%', backgroundColor: '#1a1a1a', color: '#fff',
    borderRadius: 10, padding: 14, fontSize: 16,
    borderWidth: 1, borderColor: '#333', marginBottom: 16
  },
  profileHeader: { alignItems: 'center', marginBottom: 24, width: '100%' },
  profileAvatar: { fontSize: 56, marginBottom: 8 },
  profileName: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  profileJoined: { color: '#888', fontSize: 13, marginTop: 4 },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', width: '100%', marginBottom: 24
  },
  statBox: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14,
    alignItems: 'center', width: '48%', marginBottom: 10
  },
  statValue: { color: '#FDB913', fontSize: 20, fontWeight: 'bold' },
  statLabel: { color: '#888', fontSize: 11, marginTop: 4 },
  logoutFullBtn: {
    borderWidth: 1, borderColor: '#ff6b6b', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 40, marginTop: 16
  },
  logoutFullText: { color: '#ff6b6b', fontSize: 16, fontWeight: 'bold' },
  leaderboardTitle: { color: '#FDB913', fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  leaderboardSub: { color: '#888', fontSize: 13, marginBottom: 20 },
  emptyText: { color: '#555', fontSize: 15, marginTop: 40, textAlign: 'center' },
  leaderItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 10,
    padding: 14, marginBottom: 8, width: '100%'
  },
  leaderItemMe: { borderWidth: 1, borderColor: '#FDB913' },
  leaderRank: { fontSize: 22, width: 40 },
  leaderInfo: { flex: 1 },
  leaderName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  leaderStats: { color: '#888', fontSize: 12, marginTop: 2 },
  leaderScore: { color: '#FDB913', fontSize: 18, fontWeight: 'bold' },
  refreshBtn: { marginTop: 16, padding: 12 },
  refreshText: { color: '#888', fontSize: 14 },
  barItem: {
    flexDirection: 'row', backgroundColor: '#1a1a1a',
    borderRadius: 12, padding: 14, marginBottom: 10, width: '100%'
  },
  barRank: { width: 36, justifyContent: 'center' },
  barRankNum: { fontSize: 20 },
  barInfo: { flex: 1 },
  barName: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  barStars: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barRatingText: { color: '#888', fontSize: 12 },
  barVisitors: { color: '#555', fontSize: 12, marginTop: 4 },
});

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#111', borderTopLeftRadius: 24,
    borderTopRightRadius: 24, padding: 28, paddingBottom: 48, alignItems: 'center'
  },
  title: { color: '#FDB913', fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { color: '#888', fontSize: 14, marginBottom: 16 },
  preview: { width: 160, height: 160, borderRadius: 12, marginBottom: 20 },
  label: { color: '#aaa', fontSize: 14, alignSelf: 'flex-start', marginBottom: 6 },
  ratingDesc: { color: '#fff', fontSize: 16, marginBottom: 8 },
  skipBtn: { marginTop: 16, padding: 12 },
  skipText: { color: '#555', fontSize: 14 },
});

const indicator = StyleSheet.create({
  container: { alignItems: 'center', marginVertical: 16, width: '100%' },
  label: { color: '#888', fontSize: 11, marginVertical: 4 },
  bar: {
    width: 80, height: 200, backgroundColor: '#1a1a1a',
    borderRadius: 8, borderWidth: 1, borderColor: '#333',
    position: 'relative', overflow: 'hidden',
  },
  gZone: {
    position: 'absolute', left: 0, right: 0,
    backgroundColor: 'rgba(253, 185, 19, 0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  gLetter: { color: '#FDB913', fontSize: 18, fontWeight: 'bold' },
  perfectZone: {
    position: 'absolute', left: 0, right: 0,
    backgroundColor: 'rgba(100, 255, 100, 0.3)',
  },
  midLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: '#FDB913' },
  beerLine: {
    position: 'absolute', left: 0, right: 0, height: 2,
    backgroundColor: '#4fc3f7', flexDirection: 'row', alignItems: 'center', paddingLeft: 4,
  },
  beerLabel: { color: '#4fc3f7', fontSize: 9 },
  legend: { marginTop: 12, width: '100%' },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  legendText: { color: '#888', fontSize: 12 },
});