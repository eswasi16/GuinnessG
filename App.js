import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet,
  ScrollView, ActivityIndicator, Alert, TextInput
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_BASE = 'https://guinness-g-api-production.up.railway.app';
const API_URL = `${API_BASE}/analyze`;

// --- Visual Indicator Component ---
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

// --- Main App ---
export default function App() {
  const [screen, setScreen] = useState('login'); // 'login', 'main'
  const [username, setUsername] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [profile, setProfile] = useState(null);
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [activeTab, setActiveTab] = useState('camera');

  // Check if user is already logged in
  useEffect(() => {
    AsyncStorage.getItem('username').then(u => {
      if (u) {
        setUsername(u);
        loadProfile(u);
        setScreen('main');
      }
    });
  }, []);

  const loadProfile = async (name) => {
    try {
      const { data } = await axios.get(`${API_BASE}/profile/${name}`);
      if (!data.error) setProfile(data);
    } catch (e) {
      console.log('Profile load failed:', e);
    }
  };

  const handleLogin = async () => {
    if (!usernameInput.trim()) return;
    setProfileLoading(true);

    try {
      const { data } = await axios.post(`${API_BASE}/profile`, {
        username: usernameInput.trim()
      });

      if (data.error) {
        Alert.alert('Error', data.error);
        setProfileLoading(false);
        return;
      }

      const name = data.username;
      await AsyncStorage.setItem('username', name);
      setUsername(name);
      await loadProfile(name);
      await loadHistory(name);
      await fetchLeaderboard();

      Alert.alert(
        data.status === 'created' ? '👋 Welcome!' : '🍺 Welcome Back!',
        data.message
      );

      setScreen('main');
    } catch (e) {
      Alert.alert('Error', 'Could not connect to server. Check your internet.');
    }
    setProfileLoading(false);
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel' },
      {
        text: 'Log Out', onPress: async () => {
          await AsyncStorage.removeItem('username');
          setUsername('');
          setProfile(null);
          setHistory([]);
          setResult(null);
          setImage(null);
          setUsernameInput('');
          setScreen('login');
        }
      }
    ]);
  };

  const loadHistory = async (name) => {
    const stored = await AsyncStorage.getItem(`pours_${name}`);
    if (stored) setHistory(JSON.parse(stored));
  };

  const saveScore = async (score, desc) => {
    const entry = { score, desc, date: new Date().toLocaleString() };
    const updated = [entry, ...history];
    setHistory(updated);
    await AsyncStorage.setItem(`pours_${username}`, JSON.stringify(updated));
    await submitScore(score, desc);
    await fetchLeaderboard();
    await loadProfile(username);
  };

  const submitScore = async (distance_cm, description) => {
    try {
      await axios.post(`${API_BASE}/scores`, { username, distance_cm, description });
    } catch (e) {
      console.log('Score submit failed:', e);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/leaderboard`);
      setLeaderboard(data);
    } catch (e) {
      console.log('Leaderboard fetch failed:', e);
    }
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

  const average = history.length
    ? (history.reduce((a, b) => a + b.score, 0) / history.length).toFixed(1)
    : null;

  const takePicture = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is needed to analyze your pint!');
        return;
      }

      const pic = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });

      if (!pic.canceled) {
        const uri = pic.assets[0].uri;
        setImage(uri);
        setResult(null);
        setLoading(true);

        const formData = new FormData();
        formData.append('file', { uri, name: 'pint.jpg', type: 'image/jpeg' });

        try {
          const { data } = await axios.post(API_URL, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          setResult(data);
          if (data.glass_detected && data.g_detected && data.beer_present) {
            await saveScore(data.distance_cm, data.description);
          }
        } catch (e) {
          Alert.alert('Error', 'Analysis failed. Check your internet connection.');
        }
        setLoading(false);
      }
    } catch (e) {
      Alert.alert('Camera Error', e.message);
    }
  };

  // --- Login Screen ---
  if (screen === 'login') {
    return (
      <View style={styles.loginContainer}>
        <Text style={styles.title}>🍺 Split the G</Text>
        <Text style={styles.loginSubtitle}>
          Enter your name to track your pours and compete on the leaderboard
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
            : <Text style={styles.buttonText}>Let's Pour 🍺</Text>
          }
        </TouchableOpacity>

        <Text style={styles.loginNote}>
          No password needed — just pick a unique name!
        </Text>
      </View>
    );
  }

  // --- Main App Screen ---
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🍺 Split the G</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutBtn}>Log Out</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'camera' && styles.activeTab]}
          onPress={() => setActiveTab('camera')}>
          <Text style={styles.tabText}>📸 Pour</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'profile' && styles.activeTab]}
          onPress={() => { setActiveTab('profile'); loadProfile(username); }}>
          <Text style={styles.tabText}>👤 Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'leaderboard' && styles.activeTab]}
          onPress={() => { setActiveTab('leaderboard'); fetchLeaderboard(); }}>
          <Text style={styles.tabText}>🏆 Board</Text>
        </TouchableOpacity>
      </View>

      {/* Pour Tab */}
      {activeTab === 'camera' && (
        <>
          <Text style={styles.greeting}>Hey {username} 👋</Text>

          {average && (
            <View style={styles.avgBox}>
              <Text style={styles.avgLabel}>YOUR AVERAGE</Text>
              <Text style={styles.avgValue}>{average}cm off perfect</Text>
            </View>
          )}

          <TouchableOpacity style={styles.button} onPress={takePicture}>
            <Text style={styles.buttonText}>📸 Take a Photo</Text>
          </TouchableOpacity>

          {loading && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#FDB913" />
              <Text style={styles.loadingText}>Analyzing your pour...</Text>
            </View>
          )}

          {image && <Image source={{ uri: image }} style={styles.image} />}

          {result && (
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
            </View>
          )}

          {history.length > 0 && (
            <>
              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle}>📊 My History</Text>
                <TouchableOpacity onPress={clearHistory}>
                  <Text style={styles.clearBtn}>Clear</Text>
                </TouchableOpacity>
              </View>
              {history.map((h, i) => (
                <View key={i} style={styles.historyItem}>
                  <Text style={styles.historyScore}>{h.score.toFixed(1)}cm off</Text>
                  <Text style={styles.historyDate}>{h.date}</Text>
                  <Text style={styles.historyDesc}>{h.desc}</Text>
                </View>
              ))}
            </>
          )}
        </>
      )}

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <>
          <View style={styles.profileHeader}>
            <Text style={styles.profileAvatar}>🍺</Text>
            <Text style={styles.profileName}>{username}</Text>
            <Text style={styles.profileJoined}>
              Joined {profile?.created_at?.slice(0, 10) || 'today'}
            </Text>
          </View>

          {profile && (
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{profile.total_pours}</Text>
                <Text style={styles.statLabel}>Total Pours</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{profile.avg_cm}cm</Text>
                <Text style={styles.statLabel}>Average</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{profile.best_pour}cm</Text>
                <Text style={styles.statLabel}>Best Pour</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{profile.worst_pour}cm</Text>
                <Text style={styles.statLabel}>Worst Pour</Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={styles.logoutFullBtn}
            onPress={handleLogout}>
            <Text style={styles.logoutFullText}>Log Out</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Leaderboard Tab */}
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
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 24, alignItems: 'center', paddingBottom: 60 },
  loginContainer: {
    flex: 1, backgroundColor: '#0a0a0a',
    alignItems: 'center', justifyContent: 'center', padding: 32
  },
  title: { fontSize: 36, fontWeight: 'bold', color: '#FDB913', marginBottom: 8 },
  loginSubtitle: {
    color: '#888', fontSize: 15, textAlign: 'center', marginBottom: 32, lineHeight: 22
  },
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
  loadingBox: { alignItems: 'center', marginBottom: 16 },
  loadingText: { color: '#FDB913', marginTop: 8 },
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
    alignItems: 'center', width: '100%', marginBottom: 12
  },
  historyTitle: { color: '#FDB913', fontSize: 20, fontWeight: 'bold' },
  clearBtn: { color: '#ff6b6b', fontSize: 14 },
  historyItem: {
    backgroundColor: '#1a1a1a', borderRadius: 8,
    padding: 12, width: '100%', marginBottom: 8
  },
  historyScore: { color: '#FDB913', fontSize: 16, fontWeight: 'bold' },
  historyDate: { color: '#888', fontSize: 12, marginTop: 2 },
  historyDesc: { color: '#ccc', fontSize: 13, marginTop: 4 },
  tabBar: { flexDirection: 'row', marginBottom: 24, width: '100%' },
  tab: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: '#333'
  },
  activeTab: { borderBottomColor: '#FDB913' },
  tabText: { color: '#fff', fontSize: 14 },
  input: {
    width: '100%', backgroundColor: '#1a1a1a', color: '#fff',
    borderRadius: 10, padding: 14, fontSize: 16,
    borderWidth: 1, borderColor: '#333', marginBottom: 16
  },
  profileHeader: { alignItems: 'center', marginBottom: 32, width: '100%' },
  profileAvatar: { fontSize: 64, marginBottom: 8 },
  profileName: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  profileJoined: { color: '#888', fontSize: 13, marginTop: 4 },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', width: '100%', marginBottom: 32
  },
  statBox: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16,
    alignItems: 'center', width: '48%', marginBottom: 12
  },
  statValue: { color: '#FDB913', fontSize: 24, fontWeight: 'bold' },
  statLabel: { color: '#888', fontSize: 12, marginTop: 4 },
  logoutFullBtn: {
    borderWidth: 1, borderColor: '#ff6b6b', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 40, marginTop: 8
  },
  logoutFullText: { color: '#ff6b6b', fontSize: 16, fontWeight: 'bold' },
  leaderboardTitle: { color: '#FDB913', fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  leaderboardSub: { color: '#888', fontSize: 13, marginBottom: 20 },
  emptyText: { color: '#555', fontSize: 15, marginTop: 40 },
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
  midLine: {
    position: 'absolute', left: 0, right: 0,
    height: 2, backgroundColor: '#FDB913',
  },
  beerLine: {
    position: 'absolute', left: 0, right: 0,
    height: 2, backgroundColor: '#4fc3f7',
    flexDirection: 'row', alignItems: 'center', paddingLeft: 4,
  },
  beerLabel: { color: '#4fc3f7', fontSize: 9 },
  legend: { marginTop: 12, width: '100%' },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  legendText: { color: '#888', fontSize: 12 },
});
