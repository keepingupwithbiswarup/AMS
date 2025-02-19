import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HomePage from './screens/HomePage';
import LoginPage from './screens/LoginPage';
import LiveLocation from './screens/LiveLocation';
import { Text } from 'react-native';

type RootStackParamList = {
  LoginPage: undefined;
  HomePage: undefined;
  LiveLocation: { latitude: number; longitude: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function App(): React.JSX.Element {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);

  useEffect(() => {
    const checkCurrentUser = async () => {
      try {
        const userData = await AsyncStorage.getItem('currentUser');
        if (userData) {
          setIsLoggedIn(true);
        }
      } catch (error) {
        console.error('Error checking current user:', error);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkCurrentUser();
  }, []);

  if (checkingAuth) {
    return <Text>Loading...</Text>;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={isLoggedIn ? 'HomePage' : 'LoginPage'}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="LoginPage" component={LoginPage} />
        <Stack.Screen name="HomePage" component={HomePage} />
        <Stack.Screen name="LiveLocation" component={LiveLocation} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default App;
