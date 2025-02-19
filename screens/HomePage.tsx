import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  Alert,
  Modal,
  StatusBar,
  Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import GetLocation from 'react-native-get-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QRCode from 'react-native-qrcode-svg';
import { useFocusEffect } from '@react-navigation/native';

// New imports for generating/sharing Excel reports:
import XLSX from 'xlsx';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';

function getDistanceInMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
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

const TARGET_LAT = 52.50735;
const TARGET_LON = 88.33658;
const THRESHOLD_METERS = 50;
const OUTSIDE_LIMIT_MS = 10 * 1000;

interface AttendanceData {
  attendance_id: string;
  name: string;
  attendance_date: string;
  present: number;
  in_time: string;
  out_time: string;
  duration: string;
  Latitude: string;
  Longitude: string;
}

function useLocationTracker(
  clockedInAttendanceId: string | null,
  onClockOut: (attendanceId: string) => Promise<void>,
  autoClockOutEnabled: boolean
) {
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState<boolean>(true);
  const [withinRadius, setWithinRadius] = useState<boolean>(false);
  const outsideRadiusStartTimeRef = useRef<number | null>(null);
  const clockedInRef = useRef<string | null>(clockedInAttendanceId);

  useEffect(() => {
    clockedInRef.current = clockedInAttendanceId;
  }, [clockedInAttendanceId]);

  const requestLocationPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'This app requires access to your location.',
            buttonPositive: 'OK',
            buttonNegative: 'Cancel',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (error) {
        console.warn('Permission error:', error);
        return false;
      }
    }
    return true;
  };

  const updateLocation = async () => {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      Alert.alert('Permission Denied', 'Permission denied to access location');
      setLocationLoading(false);
      return;
    }
    try {
      const location = await GetLocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 60000,
      });
      setCurrentLocation({ latitude: location.latitude, longitude: location.longitude });
      setLocationLoading(false);

      const distance = getDistanceInMeters(
        location.latitude,
        location.longitude,
        TARGET_LAT,
        TARGET_LON
      );
      const isWithin = distance <= THRESHOLD_METERS;
      setWithinRadius(isWithin);

      if (autoClockOutEnabled && clockedInRef.current) {
        if (!isWithin) {
          if (!outsideRadiusStartTimeRef.current) {
            outsideRadiusStartTimeRef.current = Date.now();
          } else {
            const elapsed = Date.now() - outsideRadiusStartTimeRef.current;
            if (elapsed >= OUTSIDE_LIMIT_MS) {
              outsideRadiusStartTimeRef.current = null;
              onClockOut(clockedInRef.current);
            }
          }
        } else {
          outsideRadiusStartTimeRef.current = null;
        }
      }
    } catch (error) {
      console.warn('Error getting location:', error);
      setLocationLoading(false);
    }
  };

  useEffect(() => {
    updateLocation();
    const intervalId = setInterval(updateLocation, 1000);
    return () => clearInterval(intervalId);
  }, [autoClockOutEnabled]);

  return { currentLocation, locationLoading, withinRadius };
}

const HomePage = ({ navigation }: { navigation: any }) => {
  const [attendanceData, setAttendanceData] = useState<AttendanceData[]>([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clockedInAttendanceId, setClockedInAttendanceId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState<boolean>(false);
  const [autoClockOutEnabled, setAutoClockOutEnabled] = useState<boolean>(true);

  useEffect(() => {
    const loadAutoClockSetting = async () => {
      try {
        const storedValue = await AsyncStorage.getItem('autoClockOutEnabled');
        if (storedValue !== null) {
          setAutoClockOutEnabled(storedValue === 'true');
        }
      } catch (error) {
        console.error('Error loading auto clock out setting:', error);
      }
    };
    loadAutoClockSetting();
  }, []);

  const toggleAutoClockOut = async (newValue: boolean) => {
    setAutoClockOutEnabled(newValue);
    try {
      await AsyncStorage.setItem('autoClockOutEnabled', newValue.toString());
    } catch (error) {
      console.error('Error saving auto clock out setting:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      checkIfClockedInToday();
    }, [])
  );

  useEffect(() => {
    fetchTotalEmployees();
    fetchAttendanceData(selectedDate);
    checkIfClockedInToday();
  }, [selectedDate]);

  const checkIfClockedInToday = async () => {
    try {
      const userData = await AsyncStorage.getItem('currentUser');
      if (!userData) {
        console.error('No user data found in AsyncStorage.');
        return;
      }
      const user = JSON.parse(userData);
      const userId = user.EmployeeId;
      const todayStr = new Date().toISOString().split('T')[0];
      const response = await fetch(
        `http://192.168.29.243:5000/api/attendance?date=${todayStr}&EmployeeId=${userId}`
      );
      if (!response.ok) throw new Error(`Error: ${response.status}`);
      const data = await response.json();
      const record = data.find(
        (item: { out_time: string }) =>
          item.out_time === '1970-01-01T00:00:00.000Z' || !item.out_time
      );
      setClockedInAttendanceId(record ? record.AttendanceId : null);
    } catch (error) {
      console.error('Error checking if user is clocked in:', error);
    }
  };

  const clockOut = async (attendanceId: string) => {
    try {
      const nowTime = new Date().toLocaleTimeString('en-GB', { hour12: false });
      const response = await fetch(
        `http://192.168.29.243:5000/api/attendance/${attendanceId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ out_time: nowTime ,Out_Latitude:String(currentLocation?.latitude),Out_Longitude:String(currentLocation?.longitude)}),
        }
      );
      if (!response.ok) throw new Error(`Clock-out API error: ${response.status}`);
      Alert.alert('Clock Out', 'You have been clocked out.');
      setClockedInAttendanceId(null);
    } catch (error) {
      console.error('Error updating out_time:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('currentUser');
      navigation.reset({
        index: 0,
        routes: [{ name: 'LoginPage' }],
      });
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  const fetchTotalEmployees = async () => {
    try {
      const response = await fetch('http://192.168.29.243:5000/api/employees');
      const data = await response.json();
      setTotalEmployees(data.length);
    } catch (error) {
      console.error('Error fetching total employees:', error);
    }
  };

  const fetchAttendanceData = async (date: Date) => {
    setLoading(true);
    try {
      const response = await fetch(
        `http://192.168.29.243:5000/api/attendance?date=${date.toISOString().split('T')[0]}`
      );
      const data = await response.json();
      setAttendanceData(data);
    } catch (error) {
      console.error('Error fetching attendance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (_: any, selected?: Date) => {
    setShowDatePicker(false);
    setSelectedDate(selected || new Date());
  };

  const formatTime = (time: string) => {
    const date = new Date(time);
    const options: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    };
    return date.toLocaleTimeString('en-GB', options);
  };

  function calculateDuration(inTime: string, outTime?: string) {
    if (!outTime || outTime === '1970-01-01T00:00:00.000Z' || outTime === '00:00') {
      return "Haven't Clocked Out Yet";
    }
    
    const inDate = new Date(inTime);
    const endDate = new Date(outTime);
    const durationMs = endDate.getTime() - inDate.getTime();
    
    if (durationMs < 0) return 'Invalid time range';
    
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
  }
  

  const handleAttendanceItemPress = async (item: AttendanceData) => {
    try {
      const qrPayload = {
        name: item.name,
        date: item.attendance_date.split('T')[0],
        latitude: item.Latitude,
        longitude: item.Longitude,
      };
      setQrData(JSON.stringify(qrPayload));
      setShowQRModal(true);
    } catch (error) {
      console.error('Error getting location for QR code', error);
      Alert.alert('Error', 'Unable to retrieve location for QR code generation.');
    }
  };

  const renderAttendanceItem = useCallback(
    ({ item }: { item: AttendanceData }) => (
      <TouchableOpacity onPress={() => handleAttendanceItemPress(item)}>
        <View style={styles.attendanceItem}>
          <Image source={require('../assets/ic_avatar.png')} style={styles.attendanceAvatar} />
          <View style={styles.attendanceInfo}>
            <Text style={styles.attendanceName}>{item.name}</Text>
            <Text style={styles.attendanceTime}>
              In {formatTime(item.in_time)}, Out {formatTime(item.out_time)}
            </Text>
          </View>
          <Text style={styles.attendanceDuration}>
            {calculateDuration(item.in_time, item.out_time)}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    []
  );

  const filteredAttendanceData = attendanceData.filter((item) => {
    const itemDate = item.attendance_date.split('T')[0];
    const selectedDateStr = selectedDate.toISOString().split('T')[0];
    return itemDate === selectedDateStr;
  });

  const presentCount = filteredAttendanceData.filter((item) => item.present).length;
  const notPresentCount = totalEmployees - presentCount;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTotalEmployees();
    fetchAttendanceData(selectedDate);
    checkIfClockedInToday();
    setRefreshing(false);
  }, [selectedDate]);

  const { currentLocation, locationLoading, withinRadius } = useLocationTracker(
    clockedInAttendanceId,
    clockOut,
    autoClockOutEnabled
  );

  const handleClockInPress = () => {
    if (currentLocation) {
      navigation.navigate('LiveLocation', {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      });
    } else {
      Alert.alert("Location Unavailable", "Unable to fetch current location at this moment.");
    }
  };

  const generateExcelReport = async () => {
    try {
      const empResponse = await fetch('http://192.168.29.243:5000/api/employees');
      const employees = await empResponse.json();
      const reportData = employees.map((emp: any) => {
        const record = attendanceData.find((att: AttendanceData) => att.name === emp.name);
        if (record) {
          const inTimeFormatted = new Date(record.in_time).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'UTC'
          });
          const outTimeFormatted =
            record.out_time && record.out_time !== '1970-01-01T00:00:00.000Z'
              ? new Date(record.out_time).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                  timeZone: 'UTC'
                })
              : '';
          return {
            Name: emp.name,
            Attendance: 'Present',
            'In Time': inTimeFormatted,
            'Out Time': outTimeFormatted,
            Duration: calculateDuration(record.in_time, record.out_time)
          };
        } else {
          return {
            Name: emp.name,
            Attendance: 'Absent',
            'In Time': 'NA',
            'Out Time': 'NA',
            Duration: 'NA'
          };
        }
      });
  
      const worksheet = XLSX.utils.json_to_sheet(reportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');
  
      const wbout = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      const filePath = RNFS.DocumentDirectoryPath + '/AttendanceReport.xlsx';
      await RNFS.writeFile(filePath, wbout, 'base64');
  
      await Share.open({
        url: 'file://' + filePath,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        title: 'Attendance Report'
      });
    } catch (error) {
      console.error('Error generating Excel report:', error);
      Alert.alert('Error', 'Could not generate the report.');
    }
  };

  return (
    <View style={styles.container}>
      {locationLoading ? (
        <ActivityIndicator size="large" color="#0000ff" style={{ flex: 1, justifyContent: 'center' }} />
      ) : (
        <>
          <View style={styles.headerContainer}>
            <StatusBar backgroundColor={"#0E1F3D"} />
            <View style={styles.headerTop}>
              <Text style={styles.headerTitle}>Attendance Management System</Text>
              <TouchableOpacity onPress={handleLogout}>
                <Text style={styles.logoutText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ padding: 16, backgroundColor: '#e6f2ff' }}>
            {withinRadius ? (
              <Text style={{ color: 'green', fontWeight: 'bold' }}>
                You are within 50m radius!
              </Text>
            ) : (
              <Text style={{ color: 'red', fontWeight: 'bold' }}>
                You are outside the 50m radius.
              </Text>
            )}
          </View>

          <FlatList
            data={filteredAttendanceData}
            renderItem={renderAttendanceItem}
            keyExtractor={(item, index) =>
              item.attendance_id ? item.attendance_id : index.toString()
            }
            ListHeaderComponent={
              <>
                <TouchableOpacity style={styles.dateRow} onPress={() => setShowDatePicker(true)}>
                  <Image source={require('../assets/ic_calendar.png')} style={styles.calendarIcon} />
                  <Text style={styles.dateText}>{selectedDate.toDateString()}</Text>
                  <Image source={require('../assets/ic_down_arrow.png')} style={styles.dropdownIcon} />
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display="default"
                    onChange={handleDateChange}
                  />
                )}
                <View style={styles.summaryContainer}>
                  <Text style={styles.summaryTitle}>Attendance Summary</Text>
                  <View style={styles.summaryCards}>
                    <View style={styles.summaryCard}>
                      <Image source={require('../assets/ic_present.png')} style={styles.summaryIcon} />
                      <Text style={styles.summaryNumber}>{presentCount}</Text>
                      <Text style={styles.summaryLabel}>Present</Text>
                    </View>
                    <View style={styles.summaryCard}>
                      <Image source={require('../assets/ic_not_present.png')} style={styles.summaryIcon} />
                      <Text style={styles.summaryNumber}>{notPresentCount}</Text>
                      <Text style={styles.summaryLabel}>Not Present</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.reportButton} onPress={generateExcelReport}>
                    <Text style={styles.reportButtonText}>Generate Attendance Sheet</Text>
                  </TouchableOpacity>
                  <View style={styles.switchContainer}>
                    <Text style={styles.switchLabel}>Auto Clock Out</Text>
                    <Switch
                      value={autoClockOutEnabled}
                      onValueChange={toggleAutoClockOut}
                    />
                  </View>
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      onPress={handleClockInPress}
                      style={styles.clockInButton}
                    >
                      <Text style={styles.buttonText}>Clock In</Text>
                    </TouchableOpacity>
                    {clockedInAttendanceId && (
                      <TouchableOpacity
                        onPress={() => clockOut(clockedInAttendanceId)}
                        style={styles.clockOutButton}
                      >
                        <Text style={styles.buttonText}>Clock Out</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.attendanceHeading}>Attendance</Text>
                </View>
              </>
            }
            ListEmptyComponent={
              loading ? (
                <ActivityIndicator size="large" color="#0000ff" />
              ) : (
                <Text style={styles.placeholderText}>No attendance data found</Text>
              )
            }
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={{ paddingBottom: 16 }}
          />

          {showQRModal && qrData && (
            <Modal
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowQRModal(false)}
            >
              <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                  <QRCode value={qrData} size={200} />
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => setShowQRModal(false)}
                  >
                    <Text style={styles.closeButtonText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}
        </>
      )}
    </View>
  );
};

export default HomePage;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  headerContainer: { backgroundColor: '#0E1F3D', paddingTop: 20, paddingBottom: 20, paddingHorizontal: 16 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#FFF', fontSize: 18 },
  logoutText: { color: 'black', fontSize: 14, backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 7, elevation: 3, borderRadius: 20 },
  dateRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 12, borderRadius: 8, elevation: 3, marginTop: 20, width: '50%', marginHorizontal: 20 },
  calendarIcon: { width: 20, height: 20, marginRight: 8 },
  dateText: { flex: 1, fontSize: 16, fontWeight: '500' },
  dropdownIcon: { width: 20, height: 20, tintColor: '#999' },
  summaryContainer: { marginHorizontal: 16, marginBottom: 16 },
  summaryTitle: { fontSize: 19, marginBottom: 16, color: 'black', paddingLeft: 10, paddingTop: 20 },
  summaryCards: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryCard: { flex: 1, alignItems: 'center', backgroundColor: '#f2f7fa', padding: 16, borderRadius: 8, marginHorizontal: 8 },
  summaryIcon: { width: 32, height: 32, marginBottom: 8 },
  summaryNumber: { fontSize: 20, fontWeight: '700', color: '#000' },
  summaryLabel: { fontSize: 14, color: '#666' },
  reportButton: { backgroundColor: '#0E1F3D', padding: 10, borderRadius: 8, alignItems: 'center', marginVertical: 10 },
  reportButtonText: { color: 'white', fontWeight: 'bold' },
  switchContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  switchLabel: { marginRight: 8, fontSize: 16, color: '#333' },
  actionButtons: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 10 },
  clockInButton: { padding: 10, backgroundColor: 'green', width: '40%', borderRadius: 20, elevation: 3, alignItems: 'center' },
  clockOutButton: { padding: 10, backgroundColor: 'red', width: '40%', borderRadius: 20, elevation: 3, alignItems: 'center' },
  buttonText: { color: 'white', textAlign: 'center', fontWeight: 'bold' },
  attendanceHeading: { fontSize: 19, color: 'black', paddingTop: 20, paddingLeft: 10 },
  attendanceItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, backgroundColor: '#FFF', marginBottom: 8, marginHorizontal: 20 },
  attendanceAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  attendanceInfo: { flex: 1 },
  attendanceName: { fontSize: 16, fontWeight: '600' },
  attendanceTime: { fontSize: 14, color: '#666' },
  attendanceDuration: { fontSize: 14, color: '#333' },
  placeholderText: { textAlign: 'center', color: '#FFF', marginTop: 20 },
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: 'white', padding: 20, borderRadius: 8, alignItems: 'center' },
  closeButton: { marginTop: 20, padding: 10, backgroundColor: '#0E1F3D', borderRadius: 5 },
  closeButtonText: { color: 'white', fontWeight: 'bold' },
});
