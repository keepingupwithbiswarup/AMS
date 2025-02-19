import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Alert, 
  Text, 
  ActivityIndicator 
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

const TARGET_LAT = 22.50735;
const TARGET_LON = 88.33658;
const THRESHOLD_METERS = 50;



function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const checkExistingAttendance = async (employeeId: number): Promise<boolean> => {
  const today = new Date().toISOString().split('T')[0];
  const url = `http://192.168.29.243:5000/api/attendance?date=${today}&EmployeeId=${employeeId}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Check attendance API error: ${response.status}`);
  const data = await response.json();
  return data.length > 0;
};

const markAttendance = async (latitude: number, longitude: number, employeeId: number) => {
  const bodyData = {
    attendance_date: new Date().toISOString().split('T')[0],
    present: 1,
    EmployeeID: employeeId,
    in_time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
    out_time: "00:00:00",
    Latitude: String(latitude),
    Longitude: String(longitude),
  };

  const response = await fetch('http://192.168.29.243:5000/api/addattendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyData),
  });

  if (!response.ok) throw new Error(`Mark attendance API error: ${response.status}`);
};

type RootStackParamList = {
  LiveLocation: {
    latitude: number;
    longitude: number;
  };
};

type Props = NativeStackScreenProps<RootStackParamList, 'LiveLocation'>;

const LiveLocation: React.FC<Props> = ({ route,navigation }) => {
  const [processing, setProcessing] = useState<boolean>(true);
  const [attendanceMarked, setAttendanceMarked] = useState<boolean>(false);
  const [region, setRegion] = useState<Region | null>(null);

  useEffect(() => {
    async function processAttendance() {
      if (
        !route.params ||
        route.params.latitude === undefined ||
        route.params.longitude === undefined
      ) {
        Alert.alert(
          "Error", 
          "Location parameters not provided.", 
          [{ text: "OK", onPress: () => navigation.goBack() }],
          { cancelable: false }
        );
        return;
      }
      const lat = route.params.latitude;
      const lon = route.params.longitude;
      const newRegion: Region = {
        latitude: lat,
        longitude: lon,
        latitudeDelta: 0.015,
        longitudeDelta: 0.0121,
      };
      setRegion(newRegion);
      
      const distance = getDistanceInMeters(lat, lon, TARGET_LAT, TARGET_LON);
      if (distance > THRESHOLD_METERS) {
        Alert.alert(
          "Attendance", 
          "You are outside the 50m radius of your office.", 
          [{ text: "OK", onPress: () => navigation.goBack() }],
          { cancelable: false }
        );
        return;
      }
      
      const userData = await AsyncStorage.getItem('currentUser');
      if (!userData) {
        Alert.alert(
          "Error", 
          "No current user found.", 
          [{ text: "OK", onPress: () => navigation.goBack() }],
          { cancelable: false }
        );
        return;
      }
      const currentUser = JSON.parse(userData);
      
      const alreadyMarked = await checkExistingAttendance(currentUser.EmployeeId);
      if (alreadyMarked) {
        Alert.alert(
          "Attendance",
          "Attendance already marked for today.",
          [{ text: "OK", onPress: () => navigation.goBack() }],
          { cancelable: false }
        );
        return;
      }
      
      // Mark attendance using the provided coordinates.
      await markAttendance(lat, lon, currentUser.EmployeeId);
      setAttendanceMarked(true);
      Alert.alert("Attendance", "Attendance marked successfully!");
    }
    
    processAttendance().finally(() => setProcessing(false));
  }, [route.params, navigation]);

  if (processing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={{ padding: 10 }}>Processing attendance...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {region ? (
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          region={region}
        >
          <Marker coordinate={{ latitude: region.latitude, longitude: region.longitude }} />
        </MapView>
      ) : (
        <Text style={{ padding: 10 }}>No region available.</Text>
      )}
      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>Lat: {region?.latitude.toFixed(5)}</Text>
        <Text style={styles.infoText}>Lng: {region?.longitude.toFixed(5)}</Text>
        {attendanceMarked && (
          <Text style={styles.infoText}>Attendance marked successfully!</Text>
        )}
      </View>
    </View>
  );
};

export default LiveLocation;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  map:{
    flex:1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "white",
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.8)',
    padding: 20,
    borderRadius: 5,
    width: '100%',
  },
  infoText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
