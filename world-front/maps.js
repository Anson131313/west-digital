// maps.js - World Front geographic data, country info, bot placements

'use strict';

const CONTINENT_BOUNDS = {
  world:        { minLon: -180, maxLon: 180,  minLat: -90,  maxLat: 90  },
  northAmerica: { minLon: -170, maxLon: -52,  minLat:   7,  maxLat: 84  },
  southAmerica: { minLon:  -82, maxLon: -34,  minLat: -56,  maxLat: 13  },
  europe:       { minLon:  -25, maxLon:  45,  minLat:  34,  maxLat: 72  },
  africa:       { minLon:  -18, maxLon:  52,  minLat: -35,  maxLat: 38  },
  asia:         { minLon:   25, maxLon: 180,  minLat: -10,  maxLat: 78  },
  oceania:      { minLon:  110, maxLon: 180,  minLat: -50,  maxLat:  5  },
  antarctica:   { minLon: -180, maxLon: 180,  minLat: -90,  maxLat:-60  },
};

const CONTINENT_LABELS = {
  world:        'World',
  northAmerica: 'North America',
  southAmerica: 'South America',
  europe:       'Europe',
  africa:       'Africa',
  asia:         'Asia',
  oceania:      'Australia/Oceania',
  antarctica:   'Antarctica',
};

const MAP_ORDER = ['world','northAmerica','southAmerica','europe','africa','asia','oceania','antarctica'];

// ISO 3166-1 numeric -> country name
const COUNTRY_NAMES = {
  4:"Afghanistan",8:"Albania",12:"Algeria",20:"Andorra",24:"Angola",
  28:"Antigua and Barbuda",32:"Argentina",36:"Australia",40:"Austria",
  31:"Azerbaijan",44:"Bahamas",48:"Bahrain",50:"Bangladesh",52:"Barbados",
  112:"Belarus",56:"Belgium",84:"Belize",204:"Benin",64:"Bhutan",
  68:"Bolivia",70:"Bosnia and Herzegovina",72:"Botswana",76:"Brazil",
  100:"Bulgaria",854:"Burkina Faso",108:"Burundi",116:"Cambodia",
  120:"Cameroon",124:"Canada",140:"Central African Republic",148:"Chad",
  152:"Chile",156:"China",170:"Colombia",178:"Congo",180:"DR Congo",
  188:"Costa Rica",191:"Croatia",192:"Cuba",196:"Cyprus",203:"Czech Republic",
  208:"Denmark",262:"Djibouti",212:"Dominica",214:"Dominican Republic",
  218:"Ecuador",818:"Egypt",222:"El Salvador",226:"Equatorial Guinea",
  232:"Eritrea",233:"Estonia",231:"Ethiopia",238:"Falkland Islands",
  242:"Fiji",246:"Finland",250:"France",266:"Gabon",270:"Gambia",
  268:"Georgia",276:"Germany",288:"Ghana",300:"Greece",308:"Grenada",
  304:"Greenland",320:"Guatemala",324:"Guinea",624:"Guinea-Bissau",
  328:"Guyana",332:"Haiti",340:"Honduras",348:"Hungary",352:"Iceland",
  356:"India",360:"Indonesia",364:"Iran",368:"Iraq",372:"Ireland",
  376:"Israel",380:"Italy",388:"Jamaica",392:"Japan",400:"Jordan",
  398:"Kazakhstan",404:"Kenya",296:"Kiribati",408:"North Korea",
  410:"South Korea",414:"Kuwait",417:"Kyrgyzstan",418:"Laos",428:"Latvia",
  422:"Lebanon",430:"Liberia",434:"Libya",438:"Liechtenstein",440:"Lithuania",
  442:"Luxembourg",807:"North Macedonia",450:"Madagascar",454:"Malawi",
  458:"Malaysia",462:"Maldives",466:"Mali",470:"Malta",584:"Marshall Islands",
  478:"Mauritania",480:"Mauritius",484:"Mexico",583:"Micronesia",498:"Moldova",
  492:"Monaco",496:"Mongolia",499:"Montenegro",504:"Morocco",508:"Mozambique",
  104:"Myanmar",516:"Namibia",520:"Nauru",524:"Nepal",528:"Netherlands",
  540:"New Caledonia",554:"New Zealand",558:"Nicaragua",562:"Niger",
  566:"Nigeria",578:"Norway",512:"Oman",586:"Pakistan",585:"Palau",
  591:"Panama",598:"Papua New Guinea",600:"Paraguay",604:"Peru",
  608:"Philippines",616:"Poland",620:"Portugal",630:"Puerto Rico",
  634:"Qatar",642:"Romania",643:"Russia",646:"Rwanda",659:"Saint Kitts",
  662:"Saint Lucia",670:"Saint Vincent",882:"Samoa",674:"San Marino",
  682:"Saudi Arabia",686:"Senegal",694:"Sierra Leone",703:"Slovakia",
  705:"Slovenia",90:"Solomon Islands",706:"Somalia",710:"South Africa",
  728:"South Sudan",724:"Spain",144:"Sri Lanka",729:"Sudan",
  740:"Suriname",752:"Sweden",756:"Switzerland",760:"Syria",158:"Taiwan",
  762:"Tajikistan",834:"Tanzania",764:"Thailand",626:"Timor-Leste",
  768:"Togo",776:"Tonga",780:"Trinidad and Tobago",788:"Tunisia",
  792:"Turkey",800:"Uganda",804:"Ukraine",784:"UAE",826:"United Kingdom",
  840:"United States",858:"Uruguay",860:"Uzbekistan",548:"Vanuatu",
  862:"Venezuela",704:"Vietnam",887:"Yemen",894:"Zambia",716:"Zimbabwe",
  10:"Antarctica",384:"Côte d'Ivoire",
};

// Which country IDs belong to each continent
const CONTINENT_COUNTRIES = {
  northAmerica: new Set([
    840,124,484,320,84,340,222,558,188,591,192,388,332,214,780,
    44,52,308,212,662,670,28,659,304,630,474,312,533
  ]),
  southAmerica: new Set([
    170,862,328,740,76,218,604,68,152,32,858,600,238,254
  ]),
  europe: new Set([
    250,724,620,276,380,826,372,528,56,442,756,40,203,703,616,
    348,642,100,300,191,70,688,499,8,807,705,208,752,578,246,
    233,428,440,112,804,498,643,352,196,470,383,20,492,438,674,336
  ]),
  africa: new Set([
    504,12,788,434,818,729,728,231,232,262,706,404,800,834,646,
    108,180,178,140,120,566,288,768,204,384,430,694,324,624,270,
    686,466,854,562,148,478,266,226,894,716,508,454,450,72,516,
    710,426,748,24,480,638,690
  ]),
  asia: new Set([
    792,760,422,376,400,368,364,414,682,887,512,784,634,48,4,
    586,356,144,50,524,64,104,764,418,704,116,458,702,360,608,
    156,496,408,410,392,158,398,860,795,417,762,268,51,31,462,626
  ]),
  oceania: new Set([
    36,554,598,242,90,548,882,776,540,296,583,585,584,520
  ]),
  antarctica: new Set([10]),
  world: null,
};

// Bot placements: {id, name, countryId, lat, lon, color}
// Large countries get multiple bots; capitals and historical splits
const BOT_PLACEMENTS = [
  // ===== NORTH AMERICA =====
  {id:1,  name:"United States",      countryId:840, lat:38.9,  lon:-77.0,  color:"#4477FF"},
  {id:2,  name:"Cherokee Nation",    countryId:840, lat:34.0,  lon:-84.4,  color:"#FF8833"},
  {id:3,  name:"Comanche Territory", countryId:840, lat:32.8,  lon:-97.3,  color:"#FF6622"},
  {id:4,  name:"Iroquois Confederacy",countryId:840,lat:42.4,  lon:-83.0,  color:"#FFAA33"},
  {id:5,  name:"Canada",             countryId:124, lat:45.4,  lon:-75.7,  color:"#CC3333"},
  {id:6,  name:"Rupert's Land",      countryId:124, lat:49.9,  lon:-97.1,  color:"#DD4444"},
  {id:7,  name:"New France",         countryId:124, lat:46.8,  lon:-71.2,  color:"#EE5555"},
  {id:8,  name:"Mexico",             countryId:484, lat:19.4,  lon:-99.1,  color:"#44BB44"},
  {id:9,  name:"Guatemala",          countryId:320, lat:14.6,  lon:-90.5,  color:"#66AA44"},
  {id:10, name:"Cuba",               countryId:192, lat:23.1,  lon:-82.4,  color:"#AA6633"},
  {id:11, name:"Haiti",              countryId:332, lat:18.5,  lon:-72.3,  color:"#886633"},
  {id:12, name:"Dominican Republic", countryId:214, lat:18.5,  lon:-69.9,  color:"#997744"},
  // ===== SOUTH AMERICA =====
  {id:13, name:"Brazil",             countryId:76,  lat:-15.8, lon:-47.9,  color:"#22CC66"},
  {id:14, name:"Tupinambá",          countryId:76,  lat:-3.1,  lon:-60.0,  color:"#33DD55"},
  {id:15, name:"Tapajós",            countryId:76,  lat:-1.4,  lon:-48.5,  color:"#11BB77"},
  {id:16, name:"Argentina",          countryId:32,  lat:-34.6, lon:-58.4,  color:"#6688CC"},
  {id:17, name:"Colombia",           countryId:170, lat:4.7,   lon:-74.1,  color:"#FFCC33"},
  {id:18, name:"Venezuela",          countryId:862, lat:10.5,  lon:-66.9,  color:"#FF9933"},
  {id:19, name:"Peru",               countryId:604, lat:-12.0, lon:-77.0,  color:"#CC8822"},
  {id:20, name:"Chile",              countryId:152, lat:-33.5, lon:-70.6,  color:"#AA66AA"},
  {id:21, name:"Bolivia",            countryId:68,  lat:-16.5, lon:-68.1,  color:"#996633"},
  {id:22, name:"Ecuador",            countryId:218, lat:-0.2,  lon:-78.5,  color:"#BBCC33"},
  {id:23, name:"Paraguay",           countryId:600, lat:-25.3, lon:-57.6,  color:"#CC9955"},
  // ===== EUROPE =====
  {id:24, name:"United Kingdom",     countryId:826, lat:51.5,  lon:-0.1,   color:"#4466CC"},
  {id:25, name:"France",             countryId:250, lat:48.9,  lon:2.3,    color:"#2244AA"},
  {id:26, name:"Germany",            countryId:276, lat:52.5,  lon:13.4,   color:"#888899"},
  {id:27, name:"Spain",              countryId:724, lat:40.4,  lon:-3.7,   color:"#CC8811"},
  {id:28, name:"Italy",              countryId:380, lat:41.9,  lon:12.5,   color:"#44AACC"},
  {id:29, name:"Poland",             countryId:616, lat:52.2,  lon:21.0,   color:"#CC4466"},
  {id:30, name:"Ukraine",            countryId:804, lat:50.5,  lon:30.5,   color:"#FFEE33"},
  {id:31, name:"Sweden",             countryId:752, lat:59.3,  lon:18.1,   color:"#4488FF"},
  {id:32, name:"Norway",             countryId:578, lat:59.9,  lon:10.7,   color:"#226699"},
  {id:33, name:"Finland",            countryId:246, lat:60.2,  lon:24.9,   color:"#AACCDD"},
  {id:34, name:"Romania",            countryId:642, lat:44.4,  lon:26.1,   color:"#CC6622"},
  {id:35, name:"Netherlands",        countryId:528, lat:52.4,  lon:4.9,    color:"#FF8811"},
  {id:36, name:"Turkey",             countryId:792, lat:39.9,  lon:32.9,   color:"#CC2222"},
  {id:37, name:"Greece",             countryId:300, lat:37.9,  lon:23.7,   color:"#2255BB"},
  {id:38, name:"Portugal",           countryId:620, lat:38.7,  lon:-9.1,   color:"#AA3333"},
  {id:39, name:"Hungary",            countryId:348, lat:47.5,  lon:19.0,   color:"#CC7722"},
  {id:40, name:"Czech Republic",     countryId:203, lat:50.1,  lon:14.4,   color:"#4488AA"},
  // ===== AFRICA =====
  {id:41, name:"Egypt",              countryId:818, lat:30.1,  lon:31.2,   color:"#DDCC77"},
  {id:42, name:"Nigeria",            countryId:566, lat:9.1,   lon:7.5,    color:"#44AA44"},
  {id:43, name:"South Africa",       countryId:710, lat:-25.7, lon:28.2,   color:"#33AACC"},
  {id:44, name:"Ethiopia",           countryId:231, lat:9.0,   lon:38.7,   color:"#AADD33"},
  {id:45, name:"DR Congo",           countryId:180, lat:-4.3,  lon:15.3,   color:"#44CC77"},
  {id:46, name:"Mali Empire",        countryId:466, lat:12.7,  lon:-8.0,   color:"#CC9922"},
  {id:47, name:"Songhai",            countryId:562, lat:13.5,  lon:2.1,    color:"#DDAA33"},
  {id:48, name:"Zulu Kingdom",       countryId:710, lat:-28.0, lon:31.5,   color:"#CC4433"},
  {id:49, name:"Kongo Kingdom",      countryId:178, lat:-4.3,  lon:15.3,   color:"#993355"},
  {id:50, name:"Nubian Kingdom",     countryId:729, lat:15.6,  lon:32.5,   color:"#BB8822"},
  {id:51, name:"Morocco",            countryId:504, lat:34.0,  lon:-6.8,   color:"#CC5522"},
  {id:52, name:"Kenya",              countryId:404, lat:-1.3,  lon:36.8,   color:"#66CC44"},
  {id:53, name:"Algeria",            countryId:12,  lat:36.7,  lon:3.1,    color:"#44AA88"},
  {id:54, name:"Sudan",              countryId:729, lat:15.5,  lon:32.5,   color:"#BBAA55"},
  {id:55, name:"Angola",             countryId:24,  lat:-8.8,  lon:13.2,   color:"#CC4444"},
  {id:56, name:"Mozambique",         countryId:508, lat:-25.9, lon:32.6,   color:"#44CC99"},
  // ===== ASIA =====
  {id:57, name:"Russia",             countryId:643, lat:55.8,  lon:37.6,   color:"#CC2222"},
  {id:58, name:"Siberian Khanate",   countryId:643, lat:55.0,  lon:82.9,   color:"#DD3333"},
  {id:59, name:"Yakutia",            countryId:643, lat:62.0,  lon:129.7,  color:"#EE4444"},
  {id:60, name:"China",              countryId:156, lat:39.9,  lon:116.4,  color:"#FFCC00"},
  {id:61, name:"Tang Dynasty",       countryId:156, lat:30.5,  lon:104.1,  color:"#FFDD22"},
  {id:62, name:"Han Realm",          countryId:156, lat:23.1,  lon:113.3,  color:"#FFEE44"},
  {id:63, name:"India",              countryId:356, lat:28.6,  lon:77.2,   color:"#FF8822"},
  {id:64, name:"Japan",              countryId:392, lat:35.7,  lon:139.7,  color:"#FF4455"},
  {id:65, name:"Saudi Arabia",       countryId:682, lat:24.7,  lon:46.7,   color:"#DDCC55"},
  {id:66, name:"Iran",               countryId:364, lat:35.7,  lon:51.4,   color:"#CC6611"},
  {id:67, name:"Indonesia",          countryId:360, lat:-6.2,  lon:106.8,  color:"#EE4411"},
  {id:68, name:"Kazakhstan",         countryId:398, lat:51.2,  lon:71.4,   color:"#88AACC"},
  {id:69, name:"Pakistan",           countryId:586, lat:33.7,  lon:73.1,   color:"#44AA77"},
  {id:70, name:"South Korea",        countryId:410, lat:37.6,  lon:127.0,  color:"#3366CC"},
  {id:71, name:"Vietnam",            countryId:704, lat:21.0,  lon:105.8,  color:"#CC3344"},
  {id:72, name:"Thailand",           countryId:764, lat:13.8,  lon:100.5,  color:"#EEBB22"},
  {id:73, name:"Myanmar",            countryId:104, lat:16.9,  lon:96.2,   color:"#AACC33"},
  {id:74, name:"Iraq",               countryId:368, lat:33.3,  lon:44.4,   color:"#CCBB33"},
  {id:75, name:"Afghanistan",        countryId:4,   lat:34.5,  lon:69.2,   color:"#BB9944"},
  {id:76, name:"Mongolia",           countryId:496, lat:47.9,  lon:106.9,  color:"#CCAA33"},
  {id:77, name:"Uzbekistan",         countryId:860, lat:41.3,  lon:69.3,   color:"#88CCAA"},
  // ===== OCEANIA =====
  {id:78, name:"Australia",          countryId:36,  lat:-35.3, lon:149.1,  color:"#FFAA22"},
  {id:79, name:"Arnhem Territory",   countryId:36,  lat:-12.5, lon:130.9,  color:"#FF8822"},
  {id:80, name:"Murri Lands",        countryId:36,  lat:-27.5, lon:153.0,  color:"#FFBB44"},
  {id:81, name:"New Zealand",        countryId:554, lat:-41.3, lon:174.8,  color:"#44CCAA"},
  {id:82, name:"Papua New Guinea",   countryId:598, lat:-9.4,  lon:147.2,  color:"#AA4455"},
  {id:83, name:"Fiji",               countryId:242, lat:-18.1, lon:178.4,  color:"#44BBCC"},
];

// Map which bots appear on each map type
function getBotsForMap(mapName) {
  if (mapName === 'world') return BOT_PLACEMENTS;
  const contSet = CONTINENT_COUNTRIES[mapName];
  if (!contSet) return BOT_PLACEMENTS;
  return BOT_PLACEMENTS.filter(b => contSet.has(b.countryId));
}

// Colors palette for player choices
const PLAYER_COLORS = [
  '#00FF88','#00CCFF','#FF44AA','#AAFF00','#FF8800',
  '#FF4444','#44FFFF','#FF00FF','#FFFF00','#FF6644',
  '#44FF44','#8844FF','#FF4488','#44FF88','#FFAA00',
];

// Build costs and effects
const BUILDINGS = {
  city:     { name:'City',          cost:500,   income:50,  troops:0,  label:'+$50/tick',  emoji:'🏙️' },
  barracks: { name:'Barracks',      cost:800,   income:0,   troops:5,  label:'+5 troops/tick', emoji:'⚔️' },
  factory:  { name:'Factory',       cost:1200,  income:100, troops:0,  label:'+$100/tick', emoji:'🏭' },
  port:     { name:'Port',          cost:1000,  income:25,  troops:0,  label:'+$25/tick + naval', emoji:'⚓' },
  battleship:{ name:'Battleship',   cost:2000,  income:0,   troops:20, label:'+20 troops', emoji:'🚢' },
  silo:     { name:'Missile Silo',  cost:5000,  income:0,   troops:0,  label:'enables missiles', emoji:'🚀' },
  atomic:   { name:'Atomic Bomb',   cost:15000, income:0,   troops:0,  label:'destroy region', emoji:'☢️' },
  hydrogen: { name:'Hydrogen Bomb', cost:30000, income:0,   troops:0,  label:'large destruction', emoji:'💥' },
  mirv:     { name:'MIRV',          cost:80000, income:0,   troops:0,  label:'multi-target', emoji:'🛸' },
};
