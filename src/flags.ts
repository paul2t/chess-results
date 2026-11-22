// Federation codes as chess-results prints them (FIDE, three letters) → flag emoji.
// Anything unknown (e.g. EUF, a club or an empty cell) stays as the code it was.

const ISO: Record<string, string> = {
  AFG: 'AF', ALB: 'AL', ALG: 'DZ', AND: 'AD', ANG: 'AO', ANT: 'AG', ARG: 'AR', ARM: 'AM', ARU: 'AW', AUS: 'AU',
  AUT: 'AT', AZE: 'AZ', BAH: 'BS', BAN: 'BD', BAR: 'BB', BDI: 'BI', BEL: 'BE', BER: 'BM', BHU: 'BT', BIH: 'BA',
  BIZ: 'BZ', BLR: 'BY', BOL: 'BO', BOT: 'BW', BRA: 'BR', BRN: 'BH', BRU: 'BN', BUL: 'BG', BUR: 'BF', CAF: 'CF',
  CAM: 'KH', CAN: 'CA', CAY: 'KY', CGO: 'CG', CHA: 'TD', CHI: 'CL', CHN: 'CN', CIV: 'CI', CMR: 'CM', COD: 'CD',
  COL: 'CO', COM: 'KM', CPV: 'CV', CRC: 'CR', CRO: 'HR', CUB: 'CU', CYP: 'CY', CZE: 'CZ', DEN: 'DK', DJI: 'DJ',
  DMA: 'DM', DOM: 'DO', ECU: 'EC', EGY: 'EG', ERI: 'ER', ESA: 'SV', ESP: 'ES', EST: 'EE', ETH: 'ET', FAI: 'FO',
  FIJ: 'FJ', FIN: 'FI', FRA: 'FR', GAB: 'GA', GAM: 'GM', GBR: 'GB', GBS: 'GW', GCI: 'GG', GEO: 'GE', GER: 'DE',
  GHA: 'GH', GRE: 'GR', GRN: 'GD', GUA: 'GT', GUI: 'GN', GUM: 'GU', GUY: 'GY', HAI: 'HT', HKG: 'HK', HON: 'HN',
  HUN: 'HU', INA: 'ID', IND: 'IN', IOM: 'IM', IRI: 'IR', IRL: 'IE', IRQ: 'IQ', ISL: 'IS', ISR: 'IL', ISV: 'VI',
  ITA: 'IT', IVB: 'VG', JAM: 'JM', JCI: 'JE', JOR: 'JO', JPN: 'JP', KAZ: 'KZ', KEN: 'KE', KGZ: 'KG', KOR: 'KR',
  KOS: 'XK', KSA: 'SA', KUW: 'KW', LAO: 'LA', LAT: 'LV', LBA: 'LY', LBN: 'LB', LBR: 'LR', LCA: 'LC', LES: 'LS',
  LIE: 'LI', LTU: 'LT', LUX: 'LU', MAC: 'MO', MAD: 'MG', MAR: 'MA', MAS: 'MY', MAW: 'MW', MDA: 'MD', MDV: 'MV',
  MEX: 'MX', MGL: 'MN', MKD: 'MK', MLI: 'ML', MLT: 'MT', MNC: 'MC', MNE: 'ME', MOZ: 'MZ', MRI: 'MU', MTN: 'MR',
  MYA: 'MM', NAM: 'NA', NCA: 'NI', NED: 'NL', NEP: 'NP', NGR: 'NG', NIG: 'NE', NIR: 'GB', NOR: 'NO', NRU: 'NR',
  NZL: 'NZ', OMA: 'OM', PAK: 'PK', PAN: 'PA', PAR: 'PY', PER: 'PE', PHI: 'PH', PLE: 'PS', PLW: 'PW', PNG: 'PG',
  POL: 'PL', POR: 'PT', PRK: 'KP', PUR: 'PR', QAT: 'QA', ROU: 'RO', RSA: 'ZA', RUS: 'RU', RWA: 'RW', SEN: 'SN',
  SEY: 'SC', SGP: 'SG', SKN: 'KN', SLE: 'SL', SLO: 'SI', SMR: 'SM', SOL: 'SB', SOM: 'SO', SRB: 'RS', SRI: 'LK',
  SSD: 'SS', STP: 'ST', SUD: 'SD', SUI: 'CH', SUR: 'SR', SVK: 'SK', SWE: 'SE', SWZ: 'SZ', SYR: 'SY', TAN: 'TZ',
  TGA: 'TO', THA: 'TH', TJK: 'TJ', TKM: 'TM', TLS: 'TL', TOG: 'TG', TPE: 'TW', TTO: 'TT', TUN: 'TN', TUR: 'TR',
  UAE: 'AE', UGA: 'UG', UKR: 'UA', URU: 'UY', USA: 'US', UZB: 'UZ', VAN: 'VU', VEN: 'VE', VIE: 'VN', VIN: 'VC',
  YEM: 'YE', ZAM: 'ZM', ZIM: 'ZW',
};

// England, Scotland and Wales have their own flags (a black flag followed by invisible subdivision tags)
const SUBDIVISION: Record<string, string> = { ENG: 'gbeng', SCO: 'gbsct', WLS: 'gbwls' };

const regional = (iso: string): string =>
  [...iso].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('');

/** The flag of a federation code ("UKR" → 🇺🇦), or the code itself when there is none. */
export function flagOf(fed: string): string {
  const code = fed.trim().toUpperCase();
  const sub = SUBDIVISION[code];
  if (sub) return String.fromCodePoint(0x1f3f4, ...[...sub].map((c) => 0xe0000 + c.charCodeAt(0)), 0xe007f);
  const iso = ISO[code];
  return iso ? regional(iso) : fed;
}
