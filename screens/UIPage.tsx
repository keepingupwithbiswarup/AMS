import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, StatusBar } from 'react-native';
import { Dropdown } from 'react-native-element-dropdown';

const UIPage = () => {
  const [activeTab, setActiveTab] = useState('gifts');

  const [giftsData, setGiftsData] = useState([]);
  const [productsData, setProductsData] = useState([]);
  const [medicinesData, setMedicinesData] = useState([]);

  const [selectedGift, setSelectedGift] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedMedicine, setSelectedMedicine] = useState(null);

  useEffect(() => {
    fetch("http://192.168.29.243:5000/api/items")
      .then(response => response.json())
      .then(data => {
        setGiftsData(data.filter((item: { category: string; }) => item.category === 'gifts'));
        setProductsData(data.filter((item: { category: string; }) => item.category === 'products'));
        setMedicinesData(data.filter((item: { category: string; }) => item.category === 'medicines'));
      })
      .catch(error => console.error("Error fetching items:", error));
  }, []);

  const handleAdd = (type: any) => {
    console.log(`Add button pressed for ${type}`);
  };

  const renderDropdownWithAdd = (data: any[], placeholder: string | undefined, selectedValue: unknown, setSelectedValue: { (value: React.SetStateAction<null>): void; (value: React.SetStateAction<null>): void; (value: React.SetStateAction<null>): void; (arg0: any): void; }, type: string) => {
    return (
      <View style={styles.dropdownRow}>
        <Dropdown
          style={styles.dropdown}
          data={data}
          labelField="label"
          valueField="value"
          placeholder={placeholder}
          value={selectedValue}
          onChange={(item) => setSelectedValue(item.value)}
        />
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => handleAdd(type)}
        >
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={"#fff"} barStyle={'dark-content'} />
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'gifts' && styles.activeTab]}
          onPress={() => setActiveTab('gifts')}
        >
          <Text style={[styles.tabText, activeTab === 'gifts' && styles.activeTabText]}>
            Gifts
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'products' && styles.activeTab]}
          onPress={() => setActiveTab('products')}
        >
          <Text style={[styles.tabText, activeTab === 'products' && styles.activeTabText]}>
            Products
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'medicines' && styles.activeTab]}
          onPress={() => setActiveTab('medicines')}
        >
          <Text style={[styles.tabText, activeTab === 'medicines' && styles.activeTabText]}>
            Medicines
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.dropdownContainer}>
        {activeTab === 'gifts' &&
          renderDropdownWithAdd(
            giftsData,
            'Select a gift',
            selectedGift,
            setSelectedGift,
            'gifts'
          )}
        {activeTab === 'products' &&
          renderDropdownWithAdd(
            productsData,
            'Select a product',
            selectedProduct,
            setSelectedProduct,
            'products'
          )}
        {activeTab === 'medicines' &&
          renderDropdownWithAdd(
            medicinesData,
            'Select a medicine',
            selectedMedicine,
            setSelectedMedicine,
            'medicines'
          )}
      </View>
    </View>
  );
};

export default UIPage;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff'
  },
  tabsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    marginTop: 100,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent'
  },
  activeTab: {
    borderBottomColor: 'darkblue'
  },
  tabText: {
    fontSize: 16,
    color: '#333'
  },
  activeTabText: {
    color: 'darkblue',
    fontWeight: 'bold'
  },
  dropdownContainer: {
    padding: 8
  },
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  dropdown: {
    flex: 1,
    height: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    marginRight: 8
  },
  addButton: {
    backgroundColor: 'teal',
    paddingVertical: 10,
    paddingHorizontal: 26,
    borderRadius: 4
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold'
  }
});
