import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet,
  ScrollView, ActivityIndicator, Alert, TextInput, Modal, SafeAreaView
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapView, { Marker } from 'react-native-maps';
import axios from 'axios';

const API_BASE = 'https://guinness-g-api-production.up.railway.app';
const API_URL = `${API_BASE}/analyze`;
const GOOGLE_KEY = 'AIzaSyA6Gx9CLrp7tGHR63ltCkd0-tRG6LmQs1c';

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
  const label = index < 3 ? `${index + 1}` : `#${index + 1}`;
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

// --- Camera ---
import { CameraView, useCameraPermissions } from 'expo-camera';

const CameraScreen = ({ onCapture, onCancel }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = React.useRef(null);
  const [capturing, setCapturing] = React.useState(false);

  if (!permission) return <View style={camStyles.container} />;

  if (!permission.granted) {
    return (
      <View style={camStyles.container}>
        <Text style={camStyles.permText}>Camera access is needed to analyze your pour.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      onCapture(photo.uri);
    } catch (e) {
      Alert.alert('Error', 'Could not take photo.');
    }
    setCapturing(false);
  };

  return (
    <View style={camStyles.container}>
      <CameraView style={StyleSheet.absoluteFill} ref={cameraRef} facing="back" />

      {/* Dimmed overlay with glass cutout */}
      <View style={camStyles.overlay}>
        {/* Top dim */}
        <View style={camStyles.dimTop} />

        {/* Middle row: dim | glass window | dim */}
        <View style={camStyles.middleRow}>
          <View style={camStyles.dimSide} />
          <View style={camStyles.glassWindow}>
            {/* Corner markers */}
            <View style={[camStyles.corner, camStyles.cornerTL]} />
            <View style={[camStyles.corner, camStyles.cornerTR]} />
            <View style={[camStyles.corner, camStyles.cornerBL]} />
            <View style={[camStyles.corner, camStyles.cornerBR]} />
            {/* Center guide line */}
            <View style={camStyles.centerLine} />
            <Text style={camStyles.guideText}>Align the G with the beer line</Text>
          </View>
          <View style={camStyles.dimSide} />
        </View>

        {/* Bottom dim */}
        <View style={camStyles.dimBottom} />
      </View>

      {/* Tip text */}
      <View style={camStyles.tipBox}>
        <Text style={camStyles.tipText}>📐 Hold phone straight · Show full glass · Include the G label</Text>
      </View>

      {/* Buttons */}
      <View style={camStyles.btnRow}>
        <TouchableOpacity style={camStyles.cancelBtn} onPress={onCancel}>
          <Text style={camStyles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[camStyles.captureBtn, capturing && { opacity: 0.5 }]}
          onPress={handleCapture}
          disabled={capturing}>
          <View style={camStyles.captureInner} />
        </TouchableOpacity>
        <View style={{ width: 70 }} />
      </View>
    </View>
  );
};

// --- Main App ---
export default function App() {
  const [screen, setScreen] = useState('login');
  const [authScreen, setAuthScreen] = useState('login'); // 'login' | 'signup' | 'forgot'
  const [authLoading, setAuthLoading] = useState(false);

  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [firstNameInput, setFirstNameInput] = useState('');
  const [lastNameInput, setLastNameInput] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [profile, setProfile] = useState(null);
  const [profilePours, setProfilePours] = useState([]);
  const [freshPhotoUri, setFreshPhotoUri] = useState(null);
  const [splitImage, setSplitImage] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [bars, setBars] = useState([]);
  const [activeTab, setActiveTab] = useState('camera');
  const [pourMode, setPourMode] = useState('idle');
  const [selectedBar, setSelectedBar] = useState(null);
  const [globalStats, setGlobalStats] = useState(null);

  // Bar modal
  const [showBarModal, setShowBarModal] = useState(false);
  const [barName, setBarName] = useState('');
  const [barRating, setBarRating] = useState(0);
  const [barSuggestions, setBarSuggestions] = useState([]);
  const [barLat, setBarLat] = useState(null);
  const [barLng, setBarLng] = useState(null);

  // Friends
  const [friendFeed, setFriendFeed] = useState([]);
  const [friends, setFriends] = useState({ following: [], followers: [] });
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);

  // Profile viewer
  const [viewingProfile, setViewingProfile] = useState(null);
  const [viewingProfileData, setViewingProfileData] = useState(null);
  const [viewingProfilePours, setViewingProfilePours] = useState([]);

  // Edit profile
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('token').then(async token => {
      if (token) {
        const storedUsername = await AsyncStorage.getItem('username');
        const storedFirst = await AsyncStorage.getItem('firstName');
        const storedLast = await AsyncStorage.getItem('lastName');
        if (storedUsername) {
          setUsername(storedUsername);
          setFirstName(storedFirst || '');
          setLastName(storedLast || '');
          loadProfile(storedUsername);
          loadProfilePours(storedUsername);
          loadHistory(storedUsername);
          fetchLeaderboard();
          fetchBars();
          loadFriends(storedUsername);
          loadFriendFeed(storedUsername);
          fetchGlobalStats();
          setScreen('main');
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!viewingProfile) {
      setViewingProfileData(null);
      setViewingProfilePours([]);
      return;
    }
    const load = async () => {
      try {
        const [{ data: prof }, { data: pours }] = await Promise.all([
          axios.get(`${API_BASE}/profile/${viewingProfile}`),
          axios.get(`${API_BASE}/profile/${viewingProfile}/pours`)
        ]);
        setViewingProfileData(prof);
        setViewingProfilePours(pours);
      } catch (e) { console.log('View profile failed:', e); }
    };
    load();
  }, [viewingProfile]);

  const completeLogin = async (token, name, first, last, photo) => {
    await AsyncStorage.setItem('token', token);
    await AsyncStorage.setItem('username', name);
    await AsyncStorage.setItem('firstName', first || '');
    await AsyncStorage.setItem('lastName', last || '');
    setUsername(name);
    setFirstName(first || '');
    setLastName(last || '');
    await loadProfile(name);
    await loadProfilePours(name);
    await loadHistory(name);
    await fetchLeaderboard();
    await fetchBars();
    await loadFriends(name);
    await loadFriendFeed(name);
    setScreen('main');
    setAuthLoading(false);
  };

  const handleLogin = async () => {
    if (!usernameInput.trim() || !passwordInput) {
      Alert.alert('Missing Fields', 'Enter your username and password.');
      return;
    }
    setAuthLoading(true);
    try {
      const { data } = await axios.post(`${API_BASE}/auth/login`, {
        username: usernameInput.trim(),
        password: passwordInput,
      });
      if (data.error) {
        Alert.alert('Login Failed', data.error);
        setAuthLoading(false);
        return;
      }
      await completeLogin(data.token, data.username, data.first_name, data.last_name, data.photo_url);
    } catch (e) {
      Alert.alert('Error', 'Could not connect to server.');
      setAuthLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!firstNameInput.trim() || !lastNameInput.trim() || !usernameInput.trim() ||
        !emailInput.trim() || !passwordInput) {
      Alert.alert('Missing Fields', 'Please fill in all fields.');
      return;
    }
    setAuthLoading(true);
    try {
      const { data } = await axios.post(`${API_BASE}/auth/signup`, {
        first_name: firstNameInput.trim(),
        last_name: lastNameInput.trim(),
        username: usernameInput.trim(),
        email: emailInput.trim().toLowerCase(),
        password: passwordInput,
      });
      if (data.error) {
        Alert.alert('Sign Up Failed', data.error);
        setAuthLoading(false);
        return;
      }
      await completeLogin(data.token, data.username, data.first_name, data.last_name, data.photo_url);
    } catch (e) {
      Alert.alert('Error', 'Could not connect to server.');
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      Alert.alert('Email Required', 'Enter your email address.');
      return;
    }
    setAuthLoading(true);
    try {
      const { data } = await axios.post(`${API_BASE}/auth/forgot-password`, {
        email: forgotEmail.trim().toLowerCase(),
      });
      Alert.alert('Check Your Email', data.message);
      setAuthScreen('login');
      setForgotEmail('');
    } catch (e) {
      Alert.alert('Error', 'Could not connect to server.');
    }
    setAuthLoading(false);
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel' },
      {
        text: 'Log Out', onPress: async () => {
          await AsyncStorage.removeItem('token');
          await AsyncStorage.removeItem('username');
          await AsyncStorage.removeItem('firstName');
          await AsyncStorage.removeItem('lastName');
          setUsername(''); setFirstName(''); setLastName('');
          setProfile(null); setProfilePours([]);
          setHistory([]); setResult(null); setSplitImage(null);
          setFreshPhotoUri(null); setUsernameInput('');
          setPasswordInput(''); setEmailInput('');
          setFirstNameInput(''); setLastNameInput('');
          setPourMode('idle'); setFriendFeed([]);
          setFriends({ following: [], followers: [] });
          setAuthScreen('login');
          setScreen('login');
        }
      }
    ]);
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
      await axios.post(`${API_BASE}/friends/follow`, { follower: username, following: target });
      await loadFriends(username);
      await loadFriendFeed(username);
      setUserResults(prev => prev.map(u => u.username === target ? { ...u, is_following: 1 } : u));
    } catch (e) { console.log('Follow failed:', e); }
    setFriendsLoading(false);
  };

  const handleUnfollow = async (target) => {
    setFriendsLoading(true);
    try {
      await axios.post(`${API_BASE}/friends/unfollow`, { follower: username, following: target });
      await loadFriends(username);
      await loadFriendFeed(username);
      setUserResults(prev => prev.map(u => u.username === target ? { ...u, is_following: 0 } : u));
    } catch (e) { console.log('Unfollow failed:', e); }
    setFriendsLoading(false);
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
        bar_name: bar, bar_rating: rating,
        fresh_photo_uri: freshUri,
        lat: barLat, lng: barLng
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
  const fetchGlobalStats = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/stats/global`);
      setGlobalStats(data);
    } catch (e) { console.log('Global stats fetch failed:', e); }
  };

  const fetchBars = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/bars`);
      setBars(data);
    } catch (e) { console.log('Bars fetch failed:', e); }
  };

  const searchBars = async (q) => {
    setBarName(q);
    setBarLat(null);
    setBarLng(null);
    if (!q.trim()) { setBarSuggestions([]); return; }
    try {
      const [{ data: localBars }, googleRes] = await Promise.all([
        axios.get(`${API_BASE}/bars/search?q=${q}`),
        axios.get('https://maps.googleapis.com/maps/api/place/autocomplete/json', {
          params: { input: q, types: 'establishment', key: GOOGLE_KEY }
        })
      ]);
      const localSuggestions = localBars.map(b => ({ name: b, place_id: null }));
      const googleSuggestions = (googleRes.data.predictions || []).map(p => ({
        name: p.description,
        place_id: p.place_id
      }));
      const seen = new Set(localSuggestions.map(s => s.name.toLowerCase()));
      const merged = [
        ...localSuggestions,
        ...googleSuggestions.filter(s => !seen.has(s.name.toLowerCase()))
      ];
      setBarSuggestions(merged.slice(0, 8));
    } catch (e) { console.log('Bar search failed:', e); }
  };

  const selectBar = async (bar) => {
    setBarName(bar.name);
    setBarSuggestions([]);
    if (bar.place_id) {
      try {
        const res = await axios.get(
          'https://maps.googleapis.com/maps/api/place/details/json',
          { params: { place_id: bar.place_id, fields: 'geometry', key: GOOGLE_KEY } }
        );
        const loc = res.data.result?.geometry?.location;
        if (loc) { setBarLat(loc.lat); setBarLng(loc.lng); }
      } catch (e) { console.log('Place details failed:', e); }
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

  const deletePour = async (pourId) => {
    Alert.alert('Delete Pour', 'Remove this pour from your profile?', [
      { text: 'Cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await axios.delete(`${API_BASE}/scores/${pourId}`, { data: { username } });
            await loadProfilePours(username);
            await loadProfile(username);
            await loadHistory(username);
          } catch (e) { Alert.alert('Error', 'Could not delete pour.'); }
        }
      }
    ]);
  };

  const handlePickProfilePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library access is needed.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled) {
        const uri = result.assets[0].uri;
        const formData = new FormData();
        formData.append('file', { uri, name: 'avatar.jpg', type: 'image/jpeg' });
        const { data } = await axios.post(
          `${API_BASE}/profile/${username}/photo`, formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        if (data.photo_url) {
          await loadProfile(username);
        }
      }
    } catch (e) {
      Alert.alert('Error', 'Could not upload photo.');
    }
  };

  const handleSaveProfile = async () => {
    if (!editFirstName.trim() || !editLastName.trim()) {
      Alert.alert('Required', 'First and last name cannot be empty.');
      return;
    }
    setEditSaving(true);
    try {
      const { data } = await axios.post(`${API_BASE}/profile/${username}/edit`, {
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
      });
      if (data.error) { Alert.alert('Error', data.error); setEditSaving(false); return; }
      setFirstName(data.first_name);
      setLastName(data.last_name);
      await AsyncStorage.setItem('firstName', data.first_name);
      await AsyncStorage.setItem('lastName', data.last_name);
      await loadProfile(username);
      setEditModalVisible(false);
    } catch (e) {
      Alert.alert('Error', 'Could not save changes.');
    }
    setEditSaving(false);
  };

  const average = history.filter(h => h.score != null).length
    ? (history.filter(h => h.score != null)
        .reduce((a, b) => a + b.score, 0) /
       history.filter(h => h.score != null).length).toFixed(1)
    : null;

  const startRatingPour = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Required', 'Camera access is needed!'); return; }
      const pic = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!pic.canceled) {
        const uri = pic.assets[0].uri;
        setLoading(true);
        const formData = new FormData();
        formData.append('file', { uri, name: 'pint.jpg', type: 'image/jpeg' });
        try {
          const { data } = await axios.post(API_URL, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          setLoading(false);
          if (!data.glass_detected || !data.beer_present) {
            Alert.alert('Not a Guinness', "We couldn't detect a Guinness. Try again with the label visible!");
            return;
          }
          setFreshPhotoUri(uri);
          setBarName('');
          setBarRating(0);
          setBarLat(null);
          setBarLng(null);
          setBarSuggestions([]);
          setShowBarModal(true);
        } catch (e) {
          setLoading(false);
          Alert.alert('Error', 'Analysis failed. Check your connection.');
        }
      }
    } catch (e) {
      Alert.alert('Camera Error', e.message);
    }
  };

  const startSplitPour = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Required', 'Camera access is needed!'); return; }
      const pic = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!pic.canceled) {
        const uri = pic.assets[0].uri;
        setSplitImage(uri);
        setResult(null);
        setLoading(true);
        setPourMode('result');
        const formData = new FormData();
        formData.append('file', { uri, name: 'pint.jpg', type: 'image/jpeg' });
        try {
          const { data } = await axios.post(API_URL, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          setResult(data);
          if (data.glass_detected && data.g_detected && data.beer_present) {
            await saveScore(data.distance_cm, data.description, 'Unknown Bar', 0, uri);
          } else {
            Alert.alert('Not a valid Guinness', 'Could not detect a proper Guinness glass. Not saved.');
          }
        } catch (e) {
          Alert.alert('Error', 'Analysis failed. Check your connection.');
        }
        setLoading(false);
      }
    } catch (e) {
      Alert.alert('Camera Error', e.message);
    }
  };

  const handleBarSubmit = () => {
    if (!barName.trim()) { Alert.alert('Bar Name Required', 'Enter the bar name!'); return; }
    if (barRating === 0) { Alert.alert('Rating Required', 'Please rate your Guinness!'); return; }
    setShowBarModal(false);
    setBarSuggestions([]);
    saveScore(null, 'No G score recorded', barName.trim(), barRating, freshPhotoUri);
  };

  const handleBarSkip = () => {
    setShowBarModal(false);
    setBarSuggestions([]);
    setFreshPhotoUri(null);
    setBarLat(null);
    setBarLng(null);
  };

  const handleTabPress = (key) => {
    setActiveTab(key);
    setSelectedBar(null);
    if (key === 'leaderboard') fetchLeaderboard();
    if (key === 'bars') fetchBars();
    if (key === 'profile') { loadProfile(username); loadProfilePours(username); }
    if (key === 'friends') { loadFriends(username); loadFriendFeed(username); }
  };

  const avatarUrl = profile?.photo_url ? `${API_BASE}${profile.photo_url}?t=${profile.photo_url}` : null;

  // ── LOGIN SCREEN ──────────────────────────────────────────────────────────
  if (screen === 'login') {
    return (
      <ScrollView
        contentContainerStyle={styles.loginContainer}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Split the G</Text>
        <Text style={styles.loginSubtitle}>
          Track your pours, rate your pints, and compete with friends
        </Text>

        {/* ── LOG IN ── */}
        {authScreen === 'login' && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#555"
              value={usernameInput}
              onChangeText={setUsernameInput}
              autoCapitalize="none"
            />
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Password"
                placeholderTextColor="#555"
                value={passwordInput}
                onChangeText={setPasswordInput}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={styles.showPasswordBtn}
                onPress={() => setShowPassword(!showPassword)}>
                <Text style={styles.showPasswordText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.button, { width: '100%', alignItems: 'center', marginTop: 16 },
                authLoading && { opacity: 0.4 }]}
              disabled={authLoading}
              onPress={handleLogin}>
              {authLoading
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.buttonText}>Log In</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 16 }} onPress={() => setAuthScreen('forgot')}>
              <Text style={styles.authLinkText}>Forgot password?</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 12 }} onPress={() => {
              setAuthScreen('signup');
              setUsernameInput('');
              setPasswordInput('');
            }}>
              <Text style={styles.authSwitchText}>
                No account? <Text style={{ color: '#FDB913' }}>Sign up</Text>
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── SIGN UP ── */}
        {authScreen === 'signup' && (
          <>
            <View style={styles.nameRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 8 }]}
                placeholder="First name"
                placeholderTextColor="#555"
                value={firstNameInput}
                onChangeText={setFirstNameInput}
                autoCapitalize="words"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Last name"
                placeholderTextColor="#555"
                value={lastNameInput}
                onChangeText={setLastNameInput}
                autoCapitalize="words"
              />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#555"
              value={usernameInput}
              onChangeText={setUsernameInput}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor="#555"
              value={emailInput}
              onChangeText={setEmailInput}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Password (min 8 characters)"
                placeholderTextColor="#555"
                value={passwordInput}
                onChangeText={setPasswordInput}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={styles.showPasswordBtn}
                onPress={() => setShowPassword(!showPassword)}>
                <Text style={styles.showPasswordText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.button, { width: '100%', alignItems: 'center', marginTop: 16 },
                authLoading && { opacity: 0.4 }]}
              disabled={authLoading}
              onPress={handleSignup}>
              {authLoading
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.buttonText}>Create Account</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 16 }} onPress={() => {
              setAuthScreen('login');
              setFirstNameInput('');
              setLastNameInput('');
              setEmailInput('');
              setPasswordInput('');
            }}>
              <Text style={styles.authSwitchText}>
                Already have an account? <Text style={{ color: '#FDB913' }}>Log in</Text>
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── FORGOT PASSWORD ── */}
        {authScreen === 'forgot' && (
          <>
            <Text style={styles.forgotInfo}>
              Enter your email and we'll send you a link to reset your password.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor="#555"
              value={forgotEmail}
              onChangeText={setForgotEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[styles.button, { width: '100%', alignItems: 'center' },
                authLoading && { opacity: 0.4 }]}
              disabled={authLoading}
              onPress={handleForgotPassword}>
              {authLoading
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.buttonText}>Send Reset Link</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 16 }} onPress={() => setAuthScreen('login')}>
              <Text style={styles.authLinkText}>← Back to login</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    );
  }

  // ── MAIN APP ──────────────────────────────────────────────────────────────
  return (
  <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>

    {/* ── Camera Screen ── */}
    {showCamera && (
      <View style={StyleSheet.absoluteFill}>
        <CameraScreen
          onCapture={handleCameraCapture}
          onCancel={() => setShowCamera(false)}
        />
      </View>
    )}

    {/* ── Edit Profile Modal ── */}
      <Modal visible={editModalVisible} transparent animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}>
        <View style={modal.overlay}>
          <ScrollView contentContainerStyle={modal.sheet} keyboardShouldPersistTaps="handled">
            <Text style={modal.title}>Edit Profile</Text>

            {/* Avatar picker */}
            <TouchableOpacity onPress={handlePickProfilePhoto} style={editStyles.avatarBtn}>
              {avatarUrl
                ? <Image source={{ uri: avatarUrl }} style={editStyles.avatarLarge} />
                : <View style={editStyles.avatarPlaceholderLarge}>
                    <Text style={editStyles.avatarInitial}>
                      {editFirstName?.[0]?.toUpperCase() || username?.[0]?.toUpperCase() || '?'}
                    </Text>
                  </View>
              }
              <View style={editStyles.cameraOverlay}>
                <Text style={{ fontSize: 16 }}>📷</Text>
              </View>
            </TouchableOpacity>
            <Text style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>Tap to change photo</Text>

            <View style={styles.nameRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 8 }]}
                placeholder="First name"
                placeholderTextColor="#555"
                value={editFirstName}
                onChangeText={setEditFirstName}
                autoCapitalize="words"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Last name"
                placeholderTextColor="#555"
                value={editLastName}
                onChangeText={setEditLastName}
                autoCapitalize="words"
              />
            </View>

            <Text style={editStyles.usernameNote}>@{username} · username cannot be changed</Text>

            <TouchableOpacity
              style={[styles.button, { width: '100%', alignItems: 'center' },
                editSaving && { opacity: 0.4 }]}
              disabled={editSaving}
              onPress={handleSaveProfile}>
              {editSaving
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.buttonText}>Save Changes</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={modal.skipBtn} onPress={() => setEditModalVisible(false)}>
              <Text style={modal.skipText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Bar Rating Modal ── */}
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
              placeholder="Search for a bar..."
              placeholderTextColor="#555"
              value={barName}
              onChangeText={searchBars}
              autoCapitalize="words"
            />
            {barSuggestions.length > 0 && (
              <View style={styles.suggestionsBox}>
                {barSuggestions.map((s, i) => (
                  <TouchableOpacity key={i} style={styles.suggestionItem}
                    onPress={() => selectBar(s)}>
                    <Text style={styles.suggestionText}>{s.name}</Text>
                    {s.place_id && (
                      <Text style={styles.suggestionSub}>📍 Google Maps</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {barLat && barLng && (
              <MapView
                style={modal.map}
                initialRegion={{
                  latitude: barLat,
                  longitude: barLng,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
              >
                <Marker
                  coordinate={{ latitude: barLat, longitude: barLng }}
                  title={barName}
                />
              </MapView>
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
              <Text style={styles.buttonText}>Save Rating</Text>
            </TouchableOpacity>
            <TouchableOpacity style={modal.skipBtn} onPress={handleBarSkip}>
              <Text style={modal.skipText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Profile Viewer Modal ── */}
      <Modal visible={!!viewingProfile} transparent animationType="slide"
        onRequestClose={() => setViewingProfile(null)}>
        <View style={profileModal.overlay}>
          <View style={profileModal.sheet}>
            <View style={profileModal.headerRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {viewingProfileData?.photo_url
                  ? <Image
                      source={{ uri: `${API_BASE}${viewingProfileData.photo_url}` }}
                      style={editStyles.avatarSmall}
                    />
                  : <View style={editStyles.avatarPlaceholderSmall}>
                      <Text style={{ color: '#FDB913', fontWeight: 'bold', fontSize: 16 }}>
                        {viewingProfile?.[0]?.toUpperCase()}
                      </Text>
                    </View>
                }
                <View>
                  <Text style={profileModal.name}>
                    {viewingProfileData?.first_name && viewingProfileData?.last_name
                      ? `${viewingProfileData.first_name} ${viewingProfileData.last_name}`
                      : viewingProfile}
                  </Text>
                  {viewingProfileData?.first_name && (
                    <Text style={profileModal.username}>@{viewingProfile}</Text>
                  )}
                </View>
              </View>
              <TouchableOpacity onPress={() => setViewingProfile(null)}>
                <Text style={profileModal.close}>Close</Text>
              </TouchableOpacity>
            </View>
            {viewingProfileData && (
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{viewingProfileData.total_pours}</Text>
                  <Text style={styles.statLabel}>Total Pours</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{viewingProfileData.avg_cm ?? '—'}cm</Text>
                  <Text style={styles.statLabel}>Avg G Score</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{'⭐'.repeat(viewingProfileData.best_rating || 0) || '—'}</Text>
                  <Text style={styles.statLabel}>Best Rating</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{'⭐'.repeat(viewingProfileData.worst_rating || 0) || '—'}</Text>
                  <Text style={styles.statLabel}>Worst Rating</Text>
                </View>
              </View>
            )}
            <ScrollView style={{ width: '100%' }}>
              {viewingProfilePours.map((pour, i) => (
                <View key={i} style={styles.pourCard}>
                  <RankBadge index={i} />
                  {pour.fresh_photo_uri
                    ? <Image source={{ uri: pour.fresh_photo_uri }} style={styles.pourThumb} />
                    : <View style={[styles.pourThumb, { backgroundColor: '#2a2a2a', justifyContent: 'center', alignItems: 'center' }]}>
                        <Text>-</Text>
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
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Split the G</Text>
        </View>

        {/* ── POUR TAB ── */}
        {activeTab === 'camera' && (
        <>
          <Text style={styles.greeting}>Hey {firstName || username}</Text>

          {/* ── GLOBAL COUNTER ── */}
          {globalStats && (
            <View style={styles.globalCountBox}>
              <Text style={styles.globalCountNum}>
                {globalStats.total_pours.toLocaleString()}
              </Text>
              <Text style={styles.globalCountLabel}>SPLITS WORLDWIDE</Text>
            </View>
          )}

          {average && (
            <View style={styles.avgBox}>
                <Text style={styles.avgLabel}>YOUR AVERAGE G SCORE</Text>
                <Text style={styles.avgValue}>{average}cm off perfect</Text>
              </View>
            )}
            {pourMode === 'idle' && !loading && (
              <View style={{ width: '100%', gap: 12, marginBottom: 24 }}>
                <TouchableOpacity style={styles.button} onPress={startRatingPour}>
                  <Text style={styles.buttonText}>Rate a Pint</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.outlineButton} onPress={startSplitPour}>
                  <Text style={styles.outlineButtonText}>Analyze My Split</Text>
                </TouchableOpacity>
              </View>
            )}
            {loading && (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#FDB913" />
                <Text style={styles.loadingText}>
                  {pourMode === 'result' ? 'Analyzing your split...' : 'Checking your Guinness...'}
                </Text>
              </View>
            )}
            {result && pourMode === 'result' && !loading && (
              <View style={styles.resultBox}>
                {splitImage && (
                  <Image source={{ uri: splitImage }} style={[styles.photoThumb, { marginBottom: 16 }]} />
                )}
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
                    {result.measurement_method && (
                      <Text style={styles.methodBadge}>
                        {result.measurement_method === 'opencv'
                          ? 'Measured with OpenCV'
                          : result.measurement_method === 'opencv+ai'
                          ? 'OpenCV + AI'
                          : 'Measured with AI'}
                      </Text>
                    )}
                  </>
                )}
                <TouchableOpacity
                  style={[styles.button, { marginTop: 16 }]}
                  onPress={() => { setPourMode('idle'); setResult(null); setSplitImage(null); setFreshPhotoUri(null); }}>
                  <Text style={styles.buttonText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
            {history.length > 0 && pourMode === 'idle' && !loading && (
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
            {bars.some(b => b.lat && b.lng) && (
              <MapView
                style={styles.fullMap}
                initialRegion={{
                  latitude: bars.find(b => b.lat)?.lat || 38.9072,
                  longitude: bars.find(b => b.lng)?.lng || -77.0369,
                  latitudeDelta: 0.1,
                  longitudeDelta: 0.1,
                }}
                scrollEnabled={true}
                zoomEnabled={true}
                showsUserLocation={true}
              >
                {bars.filter(b => b.lat && b.lng).map((bar, i) => (
                  <Marker
                    key={i}
                    coordinate={{ latitude: bar.lat, longitude: bar.lng }}
                    title={bar.bar_name}
                    description={`${'⭐'.repeat(Math.round(bar.avg_rating))} ${bar.avg_rating?.toFixed(1)} · ${bar.total_pours} pours · avg ${bar.avg_cm}cm off`}
                    pinColor="#FDB913"
                    onPress={() => setSelectedBar(bar)}
                  />
                ))}
              </MapView>
            )}
            {selectedBar && (
              <View style={styles.selectedBarCard}>
                <View style={styles.selectedBarHeader}>
                  <Text style={styles.selectedBarName}>{selectedBar.bar_name}</Text>
                  <TouchableOpacity onPress={() => setSelectedBar(null)}>
                    <Text style={styles.selectedBarClose}>✕</Text>
                  </TouchableOpacity>
                </View>
                <StarRating rating={Math.round(selectedBar.avg_rating)} size={18} />
                <Text style={styles.selectedBarStats}>
                  {selectedBar.avg_rating?.toFixed(1)} avg · {selectedBar.total_pours} pour{selectedBar.total_pours !== 1 ? 's' : ''} · {selectedBar.unique_visitors} visitor{selectedBar.unique_visitors !== 1 ? 's' : ''}
                </Text>
                <Text style={styles.selectedBarScore}>
                  avg {selectedBar.avg_cm}cm off the split
                </Text>
              </View>
            )}
            {bars.length === 0 && (
              <Text style={styles.emptyText}>No bars rated yet — tag a bar on your next pour!</Text>
            )}
            {bars.map((bar, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.barItem, selectedBar?.bar_name === bar.bar_name && styles.barItemSelected]}
                onPress={() => setSelectedBar(selectedBar?.bar_name === bar.bar_name ? null : bar)}
              >
                <View style={styles.barRank}>
                  <Text style={styles.barRankNum}>#{i + 1}</Text>
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
              </TouchableOpacity>
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
                    <TouchableOpacity onPress={() => setViewingProfile(u.username)}>
                      <Text style={styles.userResultName}>{u.username}</Text>
                    </TouchableOpacity>
                    {u.is_following ? (
                      <TouchableOpacity style={styles.unfollowBtn}
                        onPress={() => handleUnfollow(u.username)} disabled={friendsLoading}>
                        <Text style={styles.unfollowBtnText}>Unfollow</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={styles.followBtn}
                        onPress={() => handleFollow(u.username)} disabled={friendsLoading}>
                        <Text style={styles.followBtnText}>Follow</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}
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
            {friends.following.length > 0 && (
              <>
                <Text style={[styles.historyTitle, { alignSelf: 'flex-start', marginBottom: 8 }]}>Following</Text>
                {friends.following.map((name, i) => (
                  <View key={i} style={styles.friendRow}>
                    <Text style={styles.friendRowName}>{name}</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity style={styles.viewProfileBtn} onPress={() => setViewingProfile(name)}>
                        <Text style={styles.viewProfileBtnText}>View</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.unfollowBtn}
                        onPress={() => handleUnfollow(name)} disabled={friendsLoading}>
                        <Text style={styles.unfollowBtnText}>Unfollow</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}
            {friends.followers.length > 0 && (
              <>
                <Text style={[styles.historyTitle, { alignSelf: 'flex-start', marginTop: 16, marginBottom: 8 }]}>Followers</Text>
                {friends.followers.map((name, i) => (
                  <View key={i} style={styles.friendRow}>
                    <Text style={styles.friendRowName}>{name}</Text>
                    <TouchableOpacity style={styles.viewProfileBtn} onPress={() => setViewingProfile(name)}>
                      <Text style={styles.viewProfileBtnText}>View</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
            <Text style={[styles.historyTitle, { alignSelf: 'flex-start', marginTop: 16, marginBottom: 8 }]}>
              Friend Feed
            </Text>
            {friendFeed.length === 0 && (
              <Text style={styles.emptyText}>Follow friends to see their pours here!</Text>
            )}
            {friendFeed.map((pour, i) => (
              <TouchableOpacity key={i} style={styles.feedCard} onPress={() => setViewingProfile(pour.username)}>
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
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* ── ME TAB ── */}
        {activeTab === 'profile' && (
          <>
            <View style={styles.profileHeader}>
              {/* Avatar with edit badge */}
              <TouchableOpacity
                style={{ marginBottom: 12 }}
                onPress={() => {
                  setEditFirstName(profile?.first_name || firstName);
                  setEditLastName(profile?.last_name || lastName);
                  setEditModalVisible(true);
                }}>
                {avatarUrl
                  ? <Image source={{ uri: avatarUrl }} style={editStyles.avatar} />
                  : <View style={editStyles.avatarPlaceholder}>
                      <Text style={editStyles.avatarInitialSmall}>
                        {firstName?.[0]?.toUpperCase() || username?.[0]?.toUpperCase() || '?'}
                      </Text>
                    </View>
                }
                <View style={editStyles.editBadge}>
                  <Text style={{ fontSize: 11 }}>✏️</Text>
                </View>
              </TouchableOpacity>

              <Text style={styles.profileName}>
                {profile?.first_name && profile?.last_name
                  ? `${profile.first_name} ${profile.last_name}`
                  : username}
              </Text>
              <Text style={styles.profileUsername}>@{username}</Text>
              <Text style={styles.profileJoined}>
                Joined {profile?.created_at?.slice(0, 10) || 'today'}
              </Text>

              <TouchableOpacity
                style={editStyles.editProfileBtn}
                onPress={() => {
                  setEditFirstName(profile?.first_name || firstName);
                  setEditLastName(profile?.last_name || lastName);
                  setEditModalVisible(true);
                }}>
                <Text style={editStyles.editProfileBtnText}>Edit Profile</Text>
              </TouchableOpacity>
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
                <TouchableOpacity onPress={() => deletePour(pour.id)} style={styles.deleteBtn}>
                  <Text style={styles.deleteBtnText}>✕</Text>
                </TouchableOpacity>
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
              <TouchableOpacity key={i}
                style={[styles.leaderItem, entry.username === username && styles.leaderItemMe]}
                onPress={() => setViewingProfile(entry.username)}>
                <Text style={styles.leaderRank}>#{i + 1}</Text>
                <View style={styles.leaderInfo}>
                  <Text style={styles.leaderName}>
                    {entry.username}{entry.username === username ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.leaderStats}>
                    {entry.total_pours} pour{entry.total_pours !== 1 ? 's' : ''} · Best: {entry.best_pour}cm
                  </Text>
                </View>
                <Text style={styles.leaderScore}>{entry.avg_cm}cm</Text>
              </TouchableOpacity>
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
const styles = StyleSheet.create({
  content: { padding: 24, alignItems: 'center', paddingBottom: 20 },
  loginContainer: {
    flexGrow: 1, backgroundColor: '#0a0a0a',
    alignItems: 'center', justifyContent: 'center', padding: 32
  },
  title: { fontSize: 32, fontWeight: 'bold', color: '#FDB913', marginBottom: 8 },
  loginSubtitle: { color: '#888', fontSize: 15, textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  header: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', width: '100%', marginTop: 12, marginBottom: 8
  },
  greeting: { color: '#888', fontSize: 16, marginBottom: 16 },
  avgBox: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16,
    alignItems: 'center', marginBottom: 24, width: '100%'
  },
  avgLabel: { color: '#888', fontSize: 12, letterSpacing: 2 },
  avgValue: { color: '#FDB913', fontSize: 28, fontWeight: 'bold' },
  button: {
    backgroundColor: '#FDB913', borderRadius: 12,
    paddingVertical: 16, paddingHorizontal: 40,
    alignItems: 'center', marginBottom: 4
  },
  buttonText: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  outlineButton: {
    backgroundColor: '#1a1a1a', borderRadius: 12,
    paddingVertical: 16, paddingHorizontal: 40,
    alignItems: 'center', borderWidth: 1, borderColor: '#FDB913'
  },
  outlineButtonText: { fontSize: 18, fontWeight: 'bold', color: '#FDB913' },
  loadingBox: { alignItems: 'center', marginBottom: 16 },
  loadingText: { color: '#FDB913', marginTop: 8 },
  photoThumb: { width: '100%', height: 220, borderRadius: 12 },
  resultBox: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16,
    alignItems: 'center', width: '100%', marginBottom: 24
  },
  score: { fontSize: 22, color: '#FDB913', fontWeight: 'bold', marginBottom: 8 },
  position: { color: '#aaa', fontSize: 14, marginBottom: 4 },
  desc: { color: '#fff', fontSize: 14, textAlign: 'center' },
  warn: { color: '#ff6b6b', fontSize: 16, textAlign: 'center' },
  methodBadge: { color: '#555', fontSize: 12, marginTop: 8 },
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
  deleteBtn: { padding: 8, marginLeft: 6, justifyContent: 'center', alignItems: 'center' },
  deleteBtnText: { color: '#ff6b6b', fontSize: 18, fontWeight: 'bold' },
  input: {
    width: '100%', backgroundColor: '#1a1a1a', color: '#fff',
    borderRadius: 10, padding: 14, fontSize: 16,
    borderWidth: 1, borderColor: '#333', marginBottom: 16
  },
  nameRow: { flexDirection: 'row', width: '100%', marginBottom: 0 },
  passwordRow: {
    flexDirection: 'row', width: '100%', alignItems: 'center',
    marginBottom: 16, gap: 8,
  },
  showPasswordBtn: {
    paddingHorizontal: 12, paddingVertical: 14,
    backgroundColor: '#1a1a1a', borderRadius: 10,
    borderWidth: 1, borderColor: '#333',
  },
  showPasswordText: { color: '#FDB913', fontSize: 14 },
  authSwitchText: { color: '#888', fontSize: 15 },
  authLinkText: { color: '#FDB913', fontSize: 15 },
  forgotInfo: {
    color: '#aaa', fontSize: 15, textAlign: 'center',
    marginBottom: 24, lineHeight: 22,
  },
  suggestionsBox: {
    width: '100%', backgroundColor: '#1a1a1a',
    borderRadius: 10, borderWidth: 1, borderColor: '#333',
    marginTop: -12, marginBottom: 12, overflow: 'hidden'
  },
  suggestionItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  suggestionText: { color: '#fff', fontSize: 15 },
  suggestionSub: { color: '#555', fontSize: 11, marginTop: 2 },
  userResultRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a2a'
  },
  userResultName: { color: '#fff', fontSize: 16 },
  followBtn: {
    backgroundColor: '#FDB913', borderRadius: 8,
    paddingVertical: 6, paddingHorizontal: 16
  },
  followBtnText: { color: '#000', fontWeight: 'bold', fontSize: 14 },
  unfollowBtn: {
    borderWidth: 1, borderColor: '#555', borderRadius: 8,
    paddingVertical: 6, paddingHorizontal: 16
  },
  unfollowBtnText: { color: '#888', fontSize: 14 },
  friendsStatsRow: {
    flexDirection: 'row', width: '100%',
    justifyContent: 'space-around', marginVertical: 20
  },
  friendsStat: { alignItems: 'center' },
  friendsStatValue: { color: '#FDB913', fontSize: 28, fontWeight: 'bold' },
  friendsStatLabel: { color: '#888', fontSize: 13, marginTop: 4 },
  friendRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1a1a1a', borderRadius: 10,
    padding: 12, marginBottom: 8, width: '100%'
  },
  friendRowName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  viewProfileBtn: {
    borderWidth: 1, borderColor: '#FDB913', borderRadius: 8,
    paddingVertical: 6, paddingHorizontal: 12
  },
  viewProfileBtnText: { color: '#FDB913', fontSize: 13 },
  feedCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 10,
    padding: 12, marginBottom: 10, width: '100%'
  },
  feedThumb: { width: 72, height: 72, borderRadius: 8 },
  feedUsername: { color: '#FDB913', fontSize: 15, fontWeight: 'bold', marginBottom: 2 },
  feedBar: { color: '#4fc3f7', fontSize: 12, marginTop: 2 },
  feedScore: { color: '#aaa', fontSize: 13, marginTop: 2 },
  feedDate: { color: '#555', fontSize: 11, marginTop: 2 },
  profileHeader: { alignItems: 'center', marginBottom: 24, width: '100%' },
  profileName: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  profileUsername: { color: '#FDB913', fontSize: 14, marginTop: 4 },
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
  leaderRank: { fontSize: 18, fontWeight: 'bold', color: '#FDB913', width: 40 },
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
  barItemSelected: { borderWidth: 1, borderColor: '#FDB913' },
  barRank: { width: 36, justifyContent: 'center' },
  barRankNum: { fontSize: 20, color: '#FDB913', fontWeight: 'bold' },
  barInfo: { flex: 1 },
  barName: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  barStars: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barRatingText: { color: '#888', fontSize: 12 },
  barVisitors: { color: '#555', fontSize: 12, marginTop: 4 },
  fullMap: { width: '100%', height: 300, borderRadius: 16, marginBottom: 16 },
  selectedBarCard: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16,
    width: '100%', marginBottom: 16, borderWidth: 1, borderColor: '#FDB913',
  },
  selectedBarHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 4,
  },
  selectedBarName: { color: '#FDB913', fontSize: 18, fontWeight: 'bold', flex: 1 },
  selectedBarClose: { color: '#888', fontSize: 18, paddingLeft: 12 },
  selectedBarStats: { color: '#aaa', fontSize: 13, marginTop: 2 },
  selectedBarScore: { color: '#555', fontSize: 12, marginTop: 4 },

  globalCountBox: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  globalCountNum: {
    color: '#FDB913',
    fontSize: 40,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  globalCountLabel: {
    color: '#555',
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 4,
  },
});

const editStyles = StyleSheet.create({
  avatar: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 3, borderColor: '#FDB913',
  },
  avatarPlaceholder: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#1a1a1a', borderWidth: 3, borderColor: '#FDB913',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarInitialSmall: {
    color: '#FDB913', fontSize: 36, fontWeight: 'bold',
  },
  avatarLarge: {
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 3, borderColor: '#FDB913',
  },
  avatarPlaceholderLarge: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: '#1a1a1a', borderWidth: 3, borderColor: '#FDB913',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarInitial: {
    color: '#FDB913', fontSize: 44, fontWeight: 'bold',
  },
  avatarBtn: {
    position: 'relative', marginBottom: 4,
  },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: '#FDB913', borderRadius: 14,
    width: 28, height: 28, justifyContent: 'center', alignItems: 'center',
  },
  editBadge: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: '#FDB913', borderRadius: 12,
    width: 24, height: 24, justifyContent: 'center', alignItems: 'center',
  },
  editProfileBtn: {
    marginTop: 12, borderWidth: 1, borderColor: '#FDB913',
    borderRadius: 20, paddingVertical: 6, paddingHorizontal: 20,
  },
  editProfileBtnText: {
    color: '#FDB913', fontSize: 14, fontWeight: 'bold',
  },
  usernameNote: {
    color: '#555', fontSize: 13, marginBottom: 20, alignSelf: 'flex-start',
  },
  avatarSmall: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, borderColor: '#FDB913',
  },
  avatarPlaceholderSmall: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#1a1a1a', borderWidth: 2, borderColor: '#FDB913',
    justifyContent: 'center', alignItems: 'center',
  },
});

const bottomNav = StyleSheet.create({
  container: {
    flexDirection: 'row', backgroundColor: '#111',
    borderTopWidth: 1, borderTopColor: '#222',
    paddingBottom: 8, paddingTop: 10,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  label: { color: '#666', fontSize: 15, marginTop: 3 },
  labelActive: { color: '#FDB913' },
  indicator: {
    position: 'absolute', top: -10,
    width: 4, height: 4, borderRadius: 2, backgroundColor: '#FDB913',
  },
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
  map: { width: '100%', height: 130, borderRadius: 12, marginBottom: 16 },
  label: { color: '#aaa', fontSize: 14, alignSelf: 'flex-start', marginBottom: 6 },
  ratingDesc: { color: '#fff', fontSize: 16, marginBottom: 8 },
  skipBtn: { marginTop: 16, padding: 12 },
  skipText: { color: '#555', fontSize: 14 },
});

const profileModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 48, maxHeight: '85%', alignItems: 'center'
  },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', width: '100%', marginBottom: 20
  },
  name: { color: '#FDB913', fontSize: 22, fontWeight: 'bold' },
  username: { color: '#888', fontSize: 13, marginTop: 2 },
  close: { color: '#888', fontSize: 16 },
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

const camStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
  },
  dimTop: {
    flex: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  middleRow: {
    flex: 5,
    flexDirection: 'row',
  },
  dimSide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  glassWindow: {
    flex: 2.2,
    borderWidth: 2,
    borderColor: '#FDB913',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderColor: '#FDB913',
    borderWidth: 3,
  },
  cornerTL: { top: -1, left: -1, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 14 },
  cornerTR: { top: -1, right: -1, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 14 },
  cornerBL: { bottom: -1, left: -1, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 14 },
  cornerBR: { bottom: -1, right: -1, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 14 },
  centerLine: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    height: 1,
    backgroundColor: 'rgba(253,185,19,0.4)',
    top: '50%',
  },
  guideText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    textAlign: 'center',
    position: 'absolute',
    bottom: 8,
    left: 4,
    right: 4,
  },
  dimBottom: {
    flex: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  tipBox: {
    position: 'absolute',
    top: '14%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  tipText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  cancelBtn: { width: 70, alignItems: 'flex-start' },
  cancelText: { color: '#fff', fontSize: 16 },
  permText: { color: '#fff', textAlign: 'center', marginBottom: 24, padding: 32 },
});