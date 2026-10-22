// Supported bikes. Fitment years are a starting list: confirm them against
// your own templates before launch. `oem` is the stock plastics colour and
// `frame` the stock frame colour, used by the 3D preview.

export type Make = 'KTM' | 'Husqvarna' | 'GasGas' | 'Yamaha' | 'Honda' | 'Kawasaki' | 'Suzuki' | 'TM' | 'Beta' | 'Sherco'

export interface BikeModel {
  id: string
  make: Make
  model: string
  years: string
  type: BikeType
}

// MX = motocross kit, Trail = enduro / trail / adventure kit (priced differently).
export type BikeType = 'MX' | 'Trail'
export const typeLabel = (t: BikeType) => (t === 'MX' ? 'Motocross' : 'Trail')

export interface MakeInfo {
  make: Make
  oem: string
  frame: string
  // Small geometry tweaks so each make reads a little differently in 3D.
  shroudLift: number
  tailRise: number
}

export const MAKES: MakeInfo[] = [
  { make: 'KTM', oem: '#ff6a13', frame: '#ff6a13', shroudLift: 0.01, tailRise: 0.03 },
  { make: 'Husqvarna', oem: '#f4f4f2', frame: '#1f3f8f', shroudLift: 0, tailRise: 0.02 },
  { make: 'GasGas', oem: '#d4001f', frame: '#d4001f', shroudLift: 0.01, tailRise: 0.03 },
  { make: 'Yamaha', oem: '#1546b8', frame: '#b9bdc4', shroudLift: -0.01, tailRise: 0 },
  { make: 'Honda', oem: '#d10a10', frame: '#c4c7cc', shroudLift: 0, tailRise: 0.01 },
  { make: 'Kawasaki', oem: '#5dbb2f', frame: '#2a2c2e', shroudLift: -0.01, tailRise: 0.01 },
  { make: 'Suzuki', oem: '#ffd200', frame: '#b9bdc4', shroudLift: 0, tailRise: 0 },
  { make: 'TM', oem: '#f4f4f2', frame: '#b9bdc4', shroudLift: 0, tailRise: 0.02 },
  { make: 'Beta', oem: '#d4001f', frame: '#d4001f', shroudLift: 0, tailRise: 0.01 },
  { make: 'Sherco', oem: '#1546b8', frame: '#1546b8', shroudLift: 0, tailRise: 0.01 },
]

export const BIKES: BikeModel[] = [
  { id: 'ktm-sx-23', make: 'KTM', model: 'SX / SX-F / XC / XC-F', years: '2023–2024', type: 'MX' },
  { id: 'ktm-sx-19', make: 'KTM', model: 'SX / SX-F', years: '2019–2022', type: 'MX' },
  { id: 'ktm-sx-14', make: 'KTM', model: 'SX / SX-F 450', years: '2014–2016', type: 'MX' },
  { id: 'ktm-exc-24', make: 'KTM', model: 'EXC / EXC-F', years: '2024', type: 'Trail' },
  { id: 'ktm-exc-20', make: 'KTM', model: 'EXC / XC / XC-F', years: '2020–2023', type: 'Trail' },
  { id: 'ktm-rally-19', make: 'KTM', model: '450 Rally', years: '2019–2024', type: 'Trail' },
  { id: 'ktm-adv-19', make: 'KTM', model: '790 / 890 Adventure R', years: '2019–2022', type: 'Trail' },
  { id: 'ktm-990-06', make: 'KTM', model: '990 Adventure', years: '2006–2013', type: 'Trail' },
  { id: 'husq-tcfc-23', make: 'Husqvarna', model: 'TC / FC 125–450', years: '2023–2025', type: 'MX' },
  { id: 'husq-tcfc-16', make: 'Husqvarna', model: 'TC / FC / FS 125–450', years: '2016–2022', type: 'MX' },
  { id: 'husq-tefe-24', make: 'Husqvarna', model: 'TE / FE 150–501', years: '2024–2025', type: 'Trail' },
  { id: 'gg-mc-24', make: 'GasGas', model: 'MC / MC-F 125–450', years: '2024–2025', type: 'MX' },
  { id: 'gg-mc85-21', make: 'GasGas', model: 'MC 85', years: '2021–2024', type: 'MX' },
  { id: 'gg-ec-24', make: 'GasGas', model: 'EC / EC-F 250–350', years: '2024–2025', type: 'Trail' },
  { id: 'yz-250f-24', make: 'Yamaha', model: 'YZ250F', years: '2024–2025', type: 'MX' },
  { id: 'yz-450f-23', make: 'Yamaha', model: 'YZ450F', years: '2023–2025', type: 'MX' },
  { id: 'yz-2t-22', make: 'Yamaha', model: 'YZ125 / YZ250', years: '2022–2025', type: 'MX' },
  { id: 'crf-250r-22', make: 'Honda', model: 'CRF250R / RX', years: '2022–2024', type: 'MX' },
  { id: 'crf-450r-21', make: 'Honda', model: 'CRF450R / RX', years: '2021–2024', type: 'MX' },
  { id: 'crf-25', make: 'Honda', model: 'CRF250R/RX · CRF450R/RX', years: '2025', type: 'MX' },
  { id: 'crf1000-at-15', make: 'Honda', model: 'CRF1000L Africa Twin', years: '2015–2019', type: 'Trail' },
  { id: 'crf1100-adv-20', make: 'Honda', model: 'CRF1100L Africa Twin Adventure Sports', years: '2020–2023', type: 'Trail' },
  { id: 'kx-250-21', make: 'Kawasaki', model: 'KX250', years: '2021–2024', type: 'MX' },
  { id: 'kx-25', make: 'Kawasaki', model: 'KX250 (2025) · KX450 (2024–2025)', years: '2024–2025', type: 'MX' },
  { id: 'rmz-19', make: 'Suzuki', model: 'RM-Z250 / RM-Z450', years: '2019–2025', type: 'MX' },
  { id: 'tm-mx-24', make: 'TM', model: 'MX 125–450', years: '2024–2025', type: 'MX' },
  { id: 'tm-en-24', make: 'TM', model: 'EN 125–450', years: '2024–2025', type: 'Trail' },
  { id: 'beta-rx-24', make: 'Beta', model: 'RX 300 / 450', years: '2024–2025', type: 'MX' },
  { id: 'beta-rr-24', make: 'Beta', model: 'RR 125–480', years: '2024–2025', type: 'Trail' },
  { id: 'sherco-se-24', make: 'Sherco', model: 'SE / SEF 125–500', years: '2024–2025', type: 'Trail' },
]

export const makeInfo = (make: Make) => MAKES.find((m) => m.make === make)!
export const bikeById = (id: string) => BIKES.find((b) => b.id === id) ?? BIKES[0]
