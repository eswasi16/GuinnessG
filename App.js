import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet,
  ScrollView, ActivityIndicator, Alert, TextInput, Modal, SafeAreaView, FlatList
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_BASE = 'https://guinness-g-api-production.up.railway.app';
const API_URL = `${API_BASE}/analyze`;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// --- Star Rating Component ---
const StarRating = ({ rating, onRate, size = 28 }) => (
  <View style={{ flexDirection: 'row', gap: 6, marginVertical: 6 }}>
    {[1, 2, 3, 4, 5].map(star => (
      <TouchableOpacity key={star} onPress={() => onRate && onRate(star)} disabled={!onRate}>
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
          <Text style={indicator.beerLabel}>beer line</Text>
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
  const labels = ['1', '2', '3'];
  const label = index < 3 ? labels[index] : `#${index + 1}`;
  const color = index === 0 ? '#FDB913' : index === 1 ? '#ccc' : index === 2 ? '#cd7f32' : '#888';
  return (
    <Text style={{ fontSize: index < 3 ? 18 : 14, color, fontWeight: 'bold', width: 36, textAlign: 'center' }}>
      {label}
    </Text>
  );
};

// --- Bottom Tab Bar ---
const BottomTabBar = ({ activeTab, onTabPress }) => {
  const tabs = [
    { key: 'camera',      label: 'Pour'    },
    { key: 'bars',        label: 'Bars'    },
    { key: 'friends',     label: 'Friends' },
    { key: 'profile',     label: 'Me'      },
    { key: 'leaderboard', label: 'Board'   },
  ];
  return (
    <View style={bottomNav.container}>
      {tabs.map(tab => (
        <TouchableOpacity key={tab.key} style={bottomNav.tab} onPress={() => onTabPress(tab.key)}>
          <Text style={[bottomNav.label, activeTab === tab.key && bottomNav.labelActive]}>
            {tab.label}
          </Text>
          {activeTab === tab.key && <View style={bottomNav.indicator} />}
        </TouchableOpacity>
      ))}
    </View>
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

  // Pour flow
  const [pourStep, setPourStep] = useState('idle');
  const [showBarModal, setShowBarModal] = useState(false);
  const [barName, setBarName] = useState('');
  const [barRating, setBarRating] = useState(0);
  const [barSuggestions, setBarSuggestions] = useState([]);

  // Friends
  const [friendFeed, setFriendFeed] = useState([]);
  const [friends, setFriends] = useState({ following: [], followers: [] });
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);

  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    AsyncStorage.getItem('username').then(u => {
      if (u) {
        setUsername(u);
        loadProfile(u);
        loadProfilePours(u);
        setScreen('main');
        registerPushToken(u);
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(() => {});
    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {});
    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  const registerPushToken = async (name) => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      const tokenData = await Notifications.getExpoPushTokenAsync();
      await axios.post(`${API_BASE}/profile/${name}/push-token`, {
        token: tokenData.data
      });
    } catch (e) {
      console.log('Push token registration failed:', e);
    }
  };

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

  const loadFriends = async (name) => {
    try {
      const { data } = await axios.get(`${API_BASE}/friends/${name}`);
      setFriends(data);
    } catch (e) { console.log('Friends load failed:', e); }
  };

  const loadFriendFeed = async (name) => {
    try {
      const { data } = await axios.get(`${API_BASE}/friends/${name}/feed`);
      setFriendFeed(data);
    } catch (e) { console.log('Feed load failed:', e); }
  };

  const searchUsers = async (q) => {
    setUserSearch(q);
    if (!q.trim()) { setUserResults([]); return; }
    try {
      const { data } = await axios.get(`${API_BASE}/friends/${username}/search?q=${q}`);
      setUserResults(data);
    } catch (e) { console.log('User search failed:', e); }
  };

  const handleFollow = async (target) => {
    setFriendsLoading(true);
    try {
      await axios.post(`${API_BASE}/friends/follow`, {
        follower: username, following: target
      });
      await loadFriends(username);
      await loadFriendFeed(username);
    } catch (e) { console.log('Follow failed:', e); }
    setFriendsLoading(false);
  };

  const handleUnfollow = async (target) => {
    setFriendsLoading(true);
    try {
      await axios.post(`${API_BASE}/friends/unfollow`, {
        follower: username, following: target
      });
      await loadFriends(username);
      await loadFriendFeed(username);
    } catch (e) { console.log('Unfollow failed:', e); }
    setFriendsLoading(false);
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
      await loadFriends(name);
      await loadFriendFeed(name);
      registerPushToken(name);
      Alert.alert(data.status === 'created' ? 'Welcome!' : 'Welcome Back!', data.message);
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
          setPourStep('idle'); setFriendFeed([]); setFriends({ following: [], followers: [] });
          setScreen('login');
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

  const searchBars = async (q) => {
    setBarName(q);
    if (!q.trim()) { setBarSuggestions([]); return; }
    try {
      const { data } = await axios.get(`${API_BASE}/bars/search?q=${q}`);
      setBarSuggestions(data);
    } catch (e) { console.log('Bar search failed:', e); }
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

  const startNewPour = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is needed!');
        return;
      }
      setPourStep('fresh');
      const pic = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!pic.canceled) {
        const uri = pic.assets[0].uri;
        setFreshPhotoUri(uri);
        setImage(null);
        setResult(null);
        setBarName('');
        setBarRating(0);
        setBarSuggestions([]);
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

  const handleBarSubmit = () => {
    if (!barName.trim()) { Alert.alert('Bar Name Required', 'Enter the bar name!'); return; }
    if (barRating === 0) { Alert.alert('Rating Required', 'Please rate your Guinness!'); return; }
    setShowBarModal(false);
    setBarSuggestions([]);
    Alert.alert(
      'Measure Your Split?',
      'Take a sip then photograph the glass to measure your Split the G score.',
      [
        { text: 'Skip for now', onPress: () => handleSaveWithoutScore() },
        { text: 'Take Sip Photo', onPress: () => takeSipPhoto() }
      ]
    );
  };


  const handleBarSkip = () => {
    setShowBarModal(false);
    setBarSuggestions([]);
    handleSaveWithoutScore();
  };

  const handleSaveWithoutScore = async () => {
    await saveScore(null, 'No G score recorded', barName.trim(), barRating, freshPhotoUri);
    setPourStep('idle');
  };

  const takeSipPhoto = async () => {
    try {
      setPourStep('sip');
      const pic = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
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
            await saveScore(data.distance_cm, data.description, barName.trim(), barRating, freshPhotoUri);
          } else {
            // Not a valid Guinness — clear the fresh photo and reset so nothing gets saved
            Alert.alert(
              'Not a valid Guinness',
              'We could not detect a proper Guinness glass. This pour will not be saved.',
              [{ text: 'OK', onPress: () => {
                setPourStep('idle');
                setResult(null);
                setImage(null);
                setFreshPhotoUri(null);
              }}]
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

  const handleTabPress = (key) => {
    setActiveTab(key);
    if (key === 'leaderboard') fetchLeaderboard();
    if (key === 'bars') fetchBars();
    if (key === 'profile') { loadProfile(username); loadProfilePours(username); }
    if (key === 'friends') { loadFriends(username); loadFriendFeed(username); }
  };

  // --- Login Screen ---
  if (screen === 'login') {
    return (
      <View style={styles.loginContainer}>
        <Text style={styles.title}>Split the G</Text>
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
            : <Text style={styles.buttonText}>Let's Pour</Text>}
        </TouchableOpacity>
        <Text style={styles.loginNote}>No password needed — just pick a unique name!</Text>
      </View>
    );
  }

  // --- Main App ---
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      {/* Bar Rating Modal */}
      <Modal visible={showBarModal} transparent animationType="slide"
        onRequestClose={() => setShowBarModal(false)}>
        <View style={modal.overlay}>
          <View style={modal.sheet}>
            <Text style={modal.title}>How was that pint?</Text>
            <Text style={modal.subtitle}>Tag the bar and rate your Guinness</Text>
            {freshPhotoUri && (
              <Image source={{ uri: freshPhotoUri }} style={modal.preview} />
            )}
            <Text style={modal.label}>Bar Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. The Dead Rabbit, Mulligan's..."
              placeholderTextColor="#555"
              value={barName}
              onChangeText={searchBars}
              autoCapitalize="words"
            />
            {/* Bar autocomplete suggestions */}
            {barSuggestions.length > 0 && (
              <View style={styles.suggestionsBox}>
                {barSuggestions.map((s, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.suggestionItem}
                    onPress={() => { setBarName(s); setBarSuggestions([]); }}>
                    <Text style={styles.suggestionText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Text style={modal.label}>Your Rating</Text>
            <StarRating rating={barRating} onRate={setBarRating} />
            {barRating > 0 && (
              <Text style={modal.ratingDesc}>
                {barRating === 1 ? 'Terrible pint' :
                 barRating === 2 ? 'Below average' :
                 barRating === 3 ? 'Decent pint' :
                 barRating === 4 ? 'Great pint!' :
                 'Perfect pint!'}
              </Text>
            )}
            <TouchableOpacity
              style={[styles.button, { width: '100%', alignItems: 'center', marginTop: 16 }]}
              onPress={handleBarSubmit}>
              <Text style={styles.buttonText}>Next</Text>
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
          <Text style={styles.title}>Split the G</Text>
        </View>

        {/* ── POUR TAB ── */}
        {activeTab === 'camera' && (
          <>
            <Text style={styles.greeting}>Hey {username}</Text>
            {average && (
              <View style={styles.avgBox}>
                <Text style={styles.avgLabel}>YOUR AVERAGE G SCORE</Text>
                <Text style={styles.avgValue}>{average}cm off perfect</Text>
              </View>
            )}
            {pourStep === 'idle' && (
              <TouchableOpacity style={styles.button} onPress={startNewPour}>
                <Text style={styles.buttonText}>New Pint</Text>
              </TouchableOpacity>
            )}
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
            {freshPhotoUri && pourStep === 'result' && (
              <View style={styles.photoRow}>
                <View style={styles.photoCard}>
                  <Text style={styles.photoLabel}>Fresh Pint</Text>
                  <Image source={{ uri: freshPhotoUri }} style={styles.photoThumb} />
                </View>
                {image && (
                  <View style={styles.photoCard}>
                    <Text style={styles.photoLabel}>After Sip</Text>
                    <Image source={{ uri: image }} style={styles.photoThumb} />
                  </View>
                )}
              </View>
            )}
            {result && pourStep === 'result' && (
              <View style={styles.resultBox}>
                {!result.glass_detected && (
                  <Text style={styles.warn}>No Guinness detected. Try again!</Text>
                )}
                {result.glass_detected && !result.beer_present && (
                  <Text style={styles.warn}>Glass looks empty — fill it up!</Text>
                )}
                {result.glass_detected && !result.g_detected && result.beer_present && (
                  <Text style={styles.warn}>Couldn't find the G — show the label!</Text>
                )}
                {result.glass_detected && result.g_detected && result.beer_present && (
                  <>
                    <Text style={styles.score}>
                      {result.distance_cm === 0 ? 'PERFECT SPLIT!' :
                       result.distance_cm <= 0.5 ? `${result.distance_cm.toFixed(1)}cm off — so close!` :
                       result.distance_cm <= 1.5 ? `${result.distance_cm.toFixed(1)}cm off — not bad!` :
                       `${result.distance_cm.toFixed(1)}cm off — keep practicing!`}
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
            {history.length > 0 && pourStep === 'idle' && (
              <>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>Recent Pours</Text>
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
                            <Text>-</Text>
                          </View>
                      }
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        {h.score != null
                          ? <Text style={styles.historyScore}>{h.score.toFixed(1)}cm off</Text>
                          : <Text style={styles.historyScore}>No G score</Text>}
                        {h.bar_name && h.bar_name !== 'Unknown Bar' && (
                          <Text style={styles.historyBar}>{h.bar_name}</Text>
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
            <Text style={styles.leaderboardTitle}>Bar Rankings</Text>
            <Text style={styles.leaderboardSub}>Rated by the Split the G community</Text>
            {bars.length === 0 && (
              <Text style={styles.emptyText}>No bars rated yet — tag a bar on your next pour!</Text>
            )}
            {bars.map((bar, i) => (
              <View key={i} style={styles.barItem}>
                <View style={styles.barRank}>
                  <Text style={styles.barRankNum}>
                    {i === 0 ? '1' : i === 1 ? '2' : i === 2 ? '3' : `#${i + 1}`}
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
                    {bar.unique_visitors} visitor{bar.unique_visitors !== 1 ? 's' : ''} · avg {bar.avg_cm}cm off split
                  </Text>
                </View>
              </View>
            ))}
            <TouchableOpacity style={styles.refreshBtn} onPress={fetchBars}>
              <Text style={styles.refreshText}>Refresh</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── FRIENDS TAB ── */}
        {activeTab === 'friends' && (
          <>
            <Text style={styles.leaderboardTitle}>Friends</Text>

            {/* Search */}
            <TextInput
              style={[styles.input, { width: '100%' }]}
              placeholder="Search by username..."
              placeholderTextColor="#555"
              value={userSearch}
              onChangeText={searchUsers}
              autoCapitalize="none"
            />
            {userResults.length > 0 && (
              <View style={styles.suggestionsBox}>
                {userResults.map((u, i) => (
                  <View key={i} style={styles.userResultRow}>
                    <Text style={styles.userResultName}>{u.username}</Text>
                    {u.is_following ? (
                      <TouchableOpacity
                        style={styles.unfollowBtn}
                        onPress={() => handleUnfollow(u.username)}
                        disabled={friendsLoading}>
                        <Text style={styles.unfollowBtnText}>Unfollow</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.followBtn}
                        onPress={() => handleFollow(u.username)}
                        disabled={friendsLoading}>
                        <Text style={styles.followBtnText}>Follow</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Following / Followers counts */}
            <View style={styles.friendsStatsRow}>
              <View style={styles.friendsStat}>
                <Text style={styles.friendsStatValue}>{friends.following.length}</Text>
                <Text style={styles.friendsStatLabel}>Following</Text>
              </View>
              <View style={styles.friendsStat}>
                <Text style={styles.friendsStatValue}>{friends.followers.length}</Text>
                <Text style={styles.friendsStatLabel}>Followers</Text>
              </View>
            </View>

            {/* Feed */}
            <Text style={styles.historyTitle}>Friend Feed</Text>
            {friendFeed.length === 0 && (
              <Text style={styles.emptyText}>
                Follow friends to see their pours here!
              </Text>
            )}
            {friendFeed.map((pour, i) => (
              <View key={i} style={styles.feedCard}>
                {pour.fresh_photo_uri
                  ? <Image source={{ uri: pour.fresh_photo_uri }} style={styles.feedThumb} />
                  : <View style={[styles.feedThumb, { backgroundColor: '#2a2a2a', justifyContent: 'center', alignItems: 'center' }]}>
                      <Text style={{ color: '#555' }}>-</Text>
                    </View>
                }
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.feedUsername}>{pour.username}</Text>
                  {pour.bar_rating > 0 && <StarRating rating={pour.bar_rating} size={14} />}
                  {pour.bar_name && pour.bar_name !== 'Unknown Bar' && (
                    <Text style={styles.feedBar}>{pour.bar_name}</Text>
                  )}
                  {pour.distance_cm != null && (
                    <Text style={styles.feedScore}>{pour.distance_cm.toFixed(1)}cm off</Text>
                  )}
                  <Text style={styles.feedDate}>{pour.timestamp?.slice(0, 10)}</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── PROFILE TAB ── */}
        {activeTab === 'profile' && (
          <>
            <View style={styles.profileHeader}>
              <Text style={styles.profileAvatar}>[ ]</Text>
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
                  <Text style={styles.statValue}>{profile.avg_cm ?? '—'}cm</Text>
                  <Text style={styles.statLabel}>Avg G Score</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{'⭐'.repeat(profile.best_rating || 0) || '—'}</Text>
                  <Text style={styles.statLabel}>Best Rating</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{'⭐'.repeat(profile.worst_rating || 0) || '—'}</Text>
                  <Text style={styles.statLabel}>Worst Rating</Text>
                </View>
              </View>
            )}
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>My Pours</Text>
              <Text style={styles.sortLabel}>best to worst</Text>
            </View>
            <Text style={styles.tiebreakNote}>Tiebreak: lower cm off ranks higher</Text>
            {profilePours.length === 0 && (
              <Text style={styles.emptyText}>No pours yet — start with a new pint!</Text>
            )}
            {profilePours.map((pour, i) => (
              <View key={i} style={styles.pourCard}>
                <RankBadge index={i} />
                {pour.fresh_photo_uri
                  ? <Image source={{ uri: pour.fresh_photo_uri }} style={styles.pourThumb} />
                  : <View style={[styles.pourThumb, { backgroundColor: '#2a2a2a', justifyContent: 'center', alignItems: 'center' }]}>
                      <Text style={{ fontSize: 24 }}>-</Text>
                    </View>
                }
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <StarRating rating={pour.bar_rating || 0} size={16} />
                  <Text style={styles.pourScore}>
                    {pour.distance_cm != null ? `${pour.distance_cm.toFixed(1)}cm off` : 'No G score'}
                  </Text>
                  {pour.bar_name && pour.bar_name !== 'Unknown Bar' && (
                    <Text style={styles.pourBar}>{pour.bar_name}</Text>
                  )}
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
            <Text style={styles.leaderboardTitle}>Global Leaderboard</Text>
            <Text style={styles.leaderboardSub}>Ranked by average cm from perfect</Text>
            {leaderboard.length === 0 && (
              <Text style={styles.emptyText}>No scores yet — be the first!</Text>
            )}
            {leaderboard.map((entry, i) => (
              <View key={i} style={[styles.leaderItem, entry.username === username && styles.leaderItemMe]}>
                <Text style={styles.leaderRank}>
                  {i === 0 ? '1' : i === 1 ? '2' : i === 2 ? '3' : `#${i + 1}`}
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
              <Text style={styles.refreshText}>Refresh</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <BottomTabBar activeTab={activeTab} onTabPress={handleTabPress} />
    </SafeAreaView>
  );
}

// --- Styles ---
const styles = StyleSheet.crea