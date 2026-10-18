// Supported bikes. Fitment years are a starting list: confirm them against
// your own templates before launch. `oem` is the stock plastics colour and
// `frame` the stock frame colour, used by the 3D preview.

export type Make = 'KTM' | 'Husqvarna' | 'GasGas' | 'Yamaha' | 'Honda' | 'Kawasaki' | 'Suzuki'

export interface BikeModel {
  id: string
  make: Make
  model: string
  years: string
  type: 'MX' | 'Enduro'
}

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
]

export const BIKES: BikeModel[] = [
  { id: 'ktm-sx-23', make: 'KTM', model: 'SX / SX-F 125–450', years: '2023–2025', type: 'MX' },
  { id: 'ktm-exc-24', make: 'KTM', model: 'EXC / EXC-F 150–500', years: '2024–2025', type: 'Enduro' },
  { id: 'husq-tcfc-23', make: 'Husqvarna', model: 'TC / FC 125–450', years: '2023–2025', type: 'MX' },
  { id: 'husq-tefe-24', make: 'Husqvarna', model: 'TE / FE 150–501', years: '2024–2025', type: 'Enduro' },
  { id: 'gg-mc-24', make: 'GasGas', model: 'MC / MC-F 125–450', years: '2024–2025', type: 'MX' },
  { id: 'gg-ec-24', make: 'GasGas', model: 'EC / EC-F 250–350', years: '2024–2025', type: 'Enduro' },
  { id: 'yz-250f-24', make: 'Yamaha', model: 'YZ250F', years: '2024–2025', type: 'MX' },
  { id: 'yz-450f-23', make: 'Yamaha', model: 'YZ450F', years: '2023–2025', type: 'MX' },
  { id: 'yz-2t-22', make: 'Yamaha', model: 'YZ125 / YZ250', years: '2022–2025', type: 'MX' },
  { id: 'crf-250r-22', make: 'Honda', model: 'CRF250R / RX', years: '2022–2024', type: 'MX' },
  { id: 'crf-450r-21', make: 'Honda', model: 'CRF450R / RX', years: '2021–2024', type: 'MX' },
  { id: 'crf-25', make: 'Honda', model: 'CRF250R / CRF450R', years: '2025', type: 'MX' },
  { id: 'kx-250-21', make: 'Kawasaki', model: 'KX250', years: '2021–2025', type: 'MX' },
  { id: 'kx-450-24', make: 'Kawasaki', model: 'KX450', years: '2024–2025', type: 'MX' },
  { id: 'rmz-19', make: 'Suzuki', model: 'RM-Z250 / RM-Z450', years: '2019–2025', type: 'MX' },
]

export const makeInfo = (make: Make) => MAKES.find((m) => m.make === make)!
export const bikeById = (id: string) => BIKES.find((b) => b.id === id) ?? BIKES[0]
