/** Starter briefs offered before a home exists. Data only — the brief dialog fills
 *  its form from these, and generation stays inside the existing brief flow. */
export interface HomeTemplate {
  id: string;
  label: string;
  request: string;
  area: number;
  bedrooms: number;
  bathrooms: number;
  floors: number;
  spaces: string;
}

export const homeTemplates: HomeTemplate[] = [
  {
    id: 'studio', label: 'Studio · 50 m²',
    request: 'A 50 m² studio home with an open living room and kitchen, a sleeping room and one bathroom',
    area: 50, bedrooms: 1, bathrooms: 1, floors: 1, spaces: 'Open studio living and kitchen',
  },
  {
    id: 'apartment-2', label: '2-bedroom apartment · 68 m²',
    request: 'A 68 m² one-floor apartment with two bedrooms, a bathroom and an open kitchen',
    area: 68, bedrooms: 2, bathrooms: 1, floors: 1, spaces: 'Living room with open kitchen',
  },
  {
    id: 'house-small', label: 'Small house · 110 m²',
    request: 'A 110 m² one-floor house with two bedrooms, a bathroom and a living room with dining area',
    area: 110, bedrooms: 2, bathrooms: 1, floors: 1, spaces: 'Living room with dining area',
  },
  {
    id: 'compact', label: 'Compact home · 90 m²',
    request: 'A compact 90 m² home with 2 bedrooms and 1 bathroom',
    area: 90, bedrooms: 2, bathrooms: 1, floors: 1, spaces: 'No preference',
  },
  {
    id: 'family', label: 'Family home · 220 m²',
    request: 'A two-floor 220 m² family home with 4 bedrooms and 2 bathrooms',
    area: 220, bedrooms: 4, bathrooms: 2, floors: 2, spaces: 'No preference',
  },
  {
    id: 'courtyard', label: 'Your home · 240 m²',
    request: 'A two-floor 240 m² home with 3 bedrooms, 2 bathrooms, an office and courtyard',
    area: 240, bedrooms: 3, bathrooms: 2, floors: 2, spaces: 'Home office and courtyard garden',
  },
];
