import { Video, Phone, MapPin, Globe } from 'lucide-react'

// ============================================================================
// LOCATION TYPES
// ============================================================================

export const LOCATION_TYPES = [
  { value: 'GOOGLE_MEET', label: 'Google Meet', icon: Video, description: 'Auto-generate meeting link' },
  { value: 'TEAMS', label: 'Microsoft Teams', icon: Video, description: 'Auto-generate Teams meeting link' },
  { value: 'ZOOM', label: 'Zoom', icon: Video, description: 'Use your Zoom account' },
  { value: 'PHONE', label: 'Phone Call', icon: Phone, description: 'You or invitee will call' },
  { value: 'IN_PERSON', label: 'In Person', icon: MapPin, description: 'Meet at a physical location' },
  { value: 'CUSTOM', label: 'Custom', icon: Globe, description: 'Provide custom location details' },
]

// ============================================================================
// DURATIONS
// ============================================================================

export const DURATIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
]

// ============================================================================
// QUESTION TYPES
// ============================================================================

export const QUESTION_TYPES = [
  { value: 'TEXT', label: 'Short Text' },
  { value: 'TEXTAREA', label: 'Long Text' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'PHONE', label: 'Phone Number' },
  { value: 'SELECT', label: 'Dropdown' },
]

// ============================================================================
// TIMEZONES
// ============================================================================

export const TIMEZONES = [
  // UTC
  { value: 'UTC', label: 'UTC (GMT+0:00)', offset: 0 },

  // Americas
  { value: 'America/New_York', label: 'New York, Toronto (GMT-5:00)', offset: -5 },
  { value: 'America/Chicago', label: 'Chicago, Mexico City (GMT-6:00)', offset: -6 },
  { value: 'America/Denver', label: 'Denver, Mountain Time (GMT-7:00)', offset: -7 },
  { value: 'America/Los_Angeles', label: 'Los Angeles, San Francisco (GMT-8:00)', offset: -8 },
  { value: 'America/Sao_Paulo', label: 'São Paulo, Brasília (GMT-3:00)', offset: -3 },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires (GMT-3:00)', offset: -3 },
  { value: 'America/Bogota', label: 'Bogotá, Lima (GMT-5:00)', offset: -5 },
  { value: 'America/Santiago', label: 'Santiago (GMT-4:00)', offset: -4 },
  { value: 'America/Caracas', label: 'Caracas (GMT-4:00)', offset: -4 },
  { value: 'Pacific/Honolulu', label: 'Honolulu (GMT-10:00)', offset: -10 },

  // Europe
  { value: 'Europe/London', label: 'London, Dublin, Lisbon (GMT+0:00)', offset: 0 },
  { value: 'Europe/Paris', label: 'Paris, Madrid, Berlin (GMT+1:00)', offset: 1 },
  { value: 'Europe/Rome', label: 'Rome, Amsterdam, Brussels (GMT+1:00)', offset: 1 },
  { value: 'Europe/Warsaw', label: 'Warsaw, Stockholm (GMT+1:00)', offset: 1 },
  { value: 'Europe/Athens', label: 'Athens, Helsinki (GMT+2:00)', offset: 2 },
  { value: 'Europe/Istanbul', label: 'Istanbul (GMT+3:00)', offset: 3 },
  { value: 'Europe/Moscow', label: 'Moscow (GMT+3:00)', offset: 3 },

  // Africa & Middle East
  { value: 'Africa/Cairo', label: 'Cairo (GMT+2:00)', offset: 2 },
  { value: 'Africa/Johannesburg', label: 'Johannesburg, Cape Town (GMT+2:00)', offset: 2 },
  { value: 'Africa/Lagos', label: 'Lagos (GMT+1:00)', offset: 1 },
  { value: 'Africa/Nairobi', label: 'Nairobi (GMT+3:00)', offset: 3 },
  { value: 'Asia/Dubai', label: 'Dubai, Abu Dhabi (GMT+4:00)', offset: 4 },
  { value: 'Asia/Riyadh', label: 'Riyadh (GMT+3:00)', offset: 3 },
  { value: 'Asia/Tel_Aviv', label: 'Tel Aviv, Jerusalem (GMT+2:00)', offset: 2 },
  { value: 'Asia/Tehran', label: 'Tehran (GMT+3:30)', offset: 3.5 },

  // South Asia
  { value: 'Asia/Karachi', label: 'Karachi (GMT+5:00)', offset: 5 },
  { value: 'Asia/Kolkata', label: 'Mumbai, Delhi, Bangalore (GMT+5:30)', offset: 5.5 },
  { value: 'Asia/Colombo', label: 'Colombo (GMT+5:30)', offset: 5.5 },
  { value: 'Asia/Dhaka', label: 'Dhaka (GMT+6:00)', offset: 6 },
  { value: 'Asia/Kathmandu', label: 'Kathmandu (GMT+5:45)', offset: 5.75 },

  // Southeast Asia
  { value: 'Asia/Bangkok', label: 'Bangkok, Hanoi (GMT+7:00)', offset: 7 },
  { value: 'Asia/Singapore', label: 'Singapore, Kuala Lumpur (GMT+8:00)', offset: 8 },
  { value: 'Asia/Jakarta', label: 'Jakarta (GMT+7:00)', offset: 7 },
  { value: 'Asia/Manila', label: 'Manila (GMT+8:00)', offset: 8 },

  // East Asia
  { value: 'Asia/Shanghai', label: 'Beijing, Shanghai, Hong Kong (GMT+8:00)', offset: 8 },
  { value: 'Asia/Taipei', label: 'Taipei (GMT+8:00)', offset: 8 },
  { value: 'Asia/Tokyo', label: 'Tokyo, Osaka (GMT+9:00)', offset: 9 },
  { value: 'Asia/Seoul', label: 'Seoul (GMT+9:00)', offset: 9 },

  // Australia & Pacific
  { value: 'Australia/Perth', label: 'Perth (GMT+8:00)', offset: 8 },
  { value: 'Australia/Adelaide', label: 'Adelaide (GMT+9:30)', offset: 9.5 },
  { value: 'Australia/Sydney', label: 'Sydney, Melbourne (GMT+10:00)', offset: 10 },
  { value: 'Australia/Brisbane', label: 'Brisbane (GMT+10:00)', offset: 10 },
  { value: 'Pacific/Auckland', label: 'Auckland (GMT+12:00)', offset: 12 },
  { value: 'Pacific/Fiji', label: 'Fiji (GMT+12:00)', offset: 12 },
].sort((a, b) => a.offset - b.offset)

// Valid timezone values for server-side validation
export const VALID_TIMEZONE_VALUES = TIMEZONES.map((tz) => tz.value)
