/**
 * City → State for the enquiry form (17-11-2026: "Agra ya city dale to state
 * automatic aa jana chahiye"). Major cities of every state, more of them for
 * Telangana, Andhra Pradesh and Karnataka where the leads come from. A city
 * not listed simply leaves State to be typed. Client-safe.
 */
const BY_STATE = {
  'Andhra Pradesh': 'Visakhapatnam,Vizag,Vijayawada,Guntur,Nellore,Kurnool,Tirupati,Rajahmundry,Rajamahendravaram,Kakinada,Kadapa,Anantapur,Anantapuram,Eluru,Ongole,Vizianagaram,Srikakulam,Machilipatnam,Chittoor,Tenali,Proddatur,Hindupur,Bhimavaram,Madanapalle,Guntakal,Dharmavaram,Gudivada,Narasaraopet,Tadepalligudem,Amaravati,Tadipatri,Chilakaluripet,Nandyal,Adoni,Puttaparthi,Mangalagiri',
  'Arunachal Pradesh': 'Itanagar,Naharlagun,Pasighat,Tawang',
  'Assam': 'Guwahati,Silchar,Dibrugarh,Jorhat,Nagaon,Tinsukia,Tezpur,Bongaigaon',
  'Bihar': 'Patna,Gaya,Bhagalpur,Muzaffarpur,Purnia,Darbhanga,Bihar Sharif,Arrah,Begusarai,Katihar,Chapra,Hajipur',
  'Chhattisgarh': 'Raipur,Bhilai,Bilaspur,Korba,Durg,Rajnandgaon,Jagdalpur,Raigarh',
  'Goa': 'Panaji,Panjim,Margao,Madgaon,Vasco da Gama,Mapusa,Ponda',
  'Gujarat': 'Ahmedabad,Surat,Vadodara,Baroda,Rajkot,Bhavnagar,Jamnagar,Gandhinagar,Junagadh,Anand,Navsari,Morbi,Bharuch,Vapi,Mehsana,Bhuj,Porbandar,Gandhidham',
  'Haryana': 'Gurgaon,Gurugram,Faridabad,Panipat,Ambala,Yamunanagar,Rohtak,Hisar,Karnal,Sonipat,Panchkula,Bhiwani,Sirsa,Rewari,Kurukshetra',
  'Himachal Pradesh': 'Shimla,Manali,Dharamshala,Solan,Mandi,Kullu,Baddi',
  'Jharkhand': 'Ranchi,Jamshedpur,Dhanbad,Bokaro,Deoghar,Hazaribagh,Giridih',
  'Karnataka': 'Bangalore,Bengaluru,Mysore,Mysuru,Mangalore,Mangaluru,Hubli,Hubballi,Dharwad,Belgaum,Belagavi,Gulbarga,Kalaburagi,Davangere,Davanagere,Bellary,Ballari,Shimoga,Shivamogga,Tumkur,Tumakuru,Udupi,Bijapur,Vijayapura,Hassan,Mandya,Chitradurga,Raichur,Bidar,Hospet,Hosapete,Kolar,Chikmagalur,Chikkamagaluru,Karwar,Gadag,Bagalkot,Whitefield,Electronic City,Yelahanka,Chikkaballapur,Ramanagara,Madikeri,Coorg,Doddaballapur,Hoskote,Nelamangala,Anekal',
  'Kerala': 'Thiruvananthapuram,Trivandrum,Kochi,Cochin,Ernakulam,Kozhikode,Calicut,Thrissur,Kollam,Kannur,Alappuzha,Alleppey,Palakkad,Kottayam,Malappuram,Kasaragod,Pathanamthitta,Munnar',
  'Madhya Pradesh': 'Indore,Bhopal,Jabalpur,Gwalior,Ujjain,Sagar,Ratlam,Satna,Rewa,Dewas,Katni,Singrauli,Burhanpur,Khandwa,Chhindwara,Morena',
  'Maharashtra': 'Mumbai,Bombay,Pune,Nagpur,Nashik,Thane,Navi Mumbai,Aurangabad,Chhatrapati Sambhajinagar,Solapur,Kolhapur,Amravati,Nanded,Sangli,Jalgaon,Akola,Latur,Dhule,Ahmednagar,Chandrapur,Parbhani,Kalyan,Vasai,Virar,Panvel,Lonavala,Satara,Ratnagiri,Wardha,Yavatmal,Bhiwandi,Mira Road,Pimpri,Chinchwad',
  'Manipur': 'Imphal',
  'Meghalaya': 'Shillong,Tura',
  'Mizoram': 'Aizawl',
  'Nagaland': 'Kohima,Dimapur',
  'Odisha': 'Bhubaneswar,Cuttack,Rourkela,Berhampur,Brahmapur,Sambalpur,Puri,Balasore,Bhadrak,Baripada',
  'Punjab': 'Ludhiana,Amritsar,Jalandhar,Patiala,Bathinda,Mohali,Pathankot,Hoshiarpur,Moga,Firozpur,Phagwara,Kapurthala',
  'Rajasthan': 'Jaipur,Jodhpur,Udaipur,Kota,Ajmer,Bikaner,Bhilwara,Alwar,Sikar,Bharatpur,Pali,Sri Ganganagar,Ganganagar,Chittorgarh,Jaisalmer,Barmer,Tonk,Kishangarh,Beawar,Nagaur,Jhunjhunu,Banswara,Dungarpur,Mount Abu,Pushkar,Makrana',
  'Sikkim': 'Gangtok',
  'Tamil Nadu': 'Chennai,Madras,Coimbatore,Madurai,Tiruchirappalli,Trichy,Salem,Tirunelveli,Tiruppur,Erode,Vellore,Thoothukudi,Tuticorin,Thanjavur,Dindigul,Hosur,Kanchipuram,Nagercoil,Karur,Cuddalore,Kumbakonam,Ooty,Krishnagiri,Namakkal,Sivakasi',
  'Telangana': 'Hyderabad,Secunderabad,Warangal,Hanamkonda,Karimnagar,Nizamabad,Khammam,Ramagundam,Mahbubnagar,Mahabubnagar,Nalgonda,Adilabad,Suryapet,Siddipet,Miryalaguda,Mancherial,Jagtial,Sangareddy,Medak,Kamareddy,Kothagudem,Bhadrachalam,Nirmal,Wanaparthy,Gadwal,Vikarabad,Jangaon,Bhongir,Bhuvanagiri,Zaheerabad,Shamshabad,Gachibowli,Kukatpally,Madhapur,Hitech City,Banjara Hills,Jubilee Hills,Kondapur,Manikonda,Uppal,LB Nagar,Miyapur,Kompally,Medchal,Tellapur,Narsingi,Kokapet,Begumpet,Ameerpet,Dilsukhnagar,Attapur,Bachupally,Nizampet,Patancheru,Shadnagar,Ghatkesar,Peerzadiguda',
  'Tripura': 'Agartala',
  'Uttar Pradesh': 'Lucknow,Kanpur,Agra,Varanasi,Banaras,Prayagraj,Allahabad,Ghaziabad,Noida,Greater Noida,Meerut,Bareilly,Aligarh,Moradabad,Saharanpur,Gorakhpur,Jhansi,Mathura,Vrindavan,Firozabad,Ayodhya,Faizabad,Muzaffarnagar,Shahjahanpur,Rampur,Etawah,Mirzapur,Bulandshahr,Sambhal,Amroha,Hapur,Raebareli,Sitapur,Unnao,Hardoi,Lakhimpur,Basti,Azamgarh,Ballia,Jaunpur',
  'Uttarakhand': 'Dehradun,Haridwar,Rishikesh,Roorkee,Haldwani,Nainital,Rudrapur,Kashipur,Mussoorie',
  'West Bengal': 'Kolkata,Calcutta,Howrah,Durgapur,Asansol,Siliguri,Bardhaman,Kharagpur,Haldia,Darjeeling,Malda,Bhatpara',
  'Andaman and Nicobar Islands': 'Port Blair',
  'Chandigarh': 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu': 'Daman,Diu,Silvassa',
  'Delhi': 'Delhi,New Delhi,Dwarka,Rohini,Saket,Karol Bagh',
  'Jammu and Kashmir': 'Srinagar,Jammu,Anantnag,Baramulla,Katra',
  'Ladakh': 'Leh,Kargil',
  'Lakshadweep': 'Kavaratti',
  'Puducherry': 'Puducherry,Pondicherry,Karaikal,Mahe,Yanam',
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');

const MAP = new Map();
export const CITY_NAMES = [];
for (const [state, list] of Object.entries(BY_STATE)) {
  for (const city of list.split(',')) {
    if (!MAP.has(norm(city))) { MAP.set(norm(city), state); CITY_NAMES.push(city); }
  }
}
CITY_NAMES.sort();

// "agra", " Agra ", "AGRA" → "Uttar Pradesh"; '' when not known.
export function stateForCity(city) {
  return MAP.get(norm(city)) || '';
}

export const isCityField = (f) => /^city(\s*name)?$/i.test(String(f?.field_label || '').trim());
export const isStateField = (f) => /^state(\s*name)?$/i.test(String(f?.field_label || '').trim());
