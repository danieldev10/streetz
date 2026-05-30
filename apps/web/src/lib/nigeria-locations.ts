export type NigerianStateLocation = {
  state: string;
  cities: string[];
};

export const nigeriaLocations: NigerianStateLocation[] = [
  { state: "Abia", cities: ["Aba", "Umuahia", "Ohafia", "Arochukwu", "Bende"] },
  { state: "Adamawa", cities: ["Yola", "Mubi", "Numan", "Jimeta", "Ganye"] },
  { state: "Akwa Ibom", cities: ["Uyo", "Eket", "Ikot Ekpene", "Oron", "Abak"] },
  { state: "Anambra", cities: ["Awka", "Onitsha", "Nnewi", "Ekwulobia", "Ihiala"] },
  { state: "Bauchi", cities: ["Bauchi", "Azare", "Misau", "Jama'are", "Dass"] },
  { state: "Bayelsa", cities: ["Yenagoa", "Brass", "Ogbia", "Sagbama", "Nembe"] },
  { state: "Benue", cities: ["Makurdi", "Gboko", "Otukpo", "Katsina-Ala", "Vandeikya"] },
  { state: "Borno", cities: ["Maiduguri", "Biu", "Bama", "Monguno", "Dikwa"] },
  { state: "Cross River", cities: ["Calabar", "Ikom", "Ogoja", "Obudu", "Ugep"] },
  { state: "Delta", cities: ["Asaba", "Warri", "Sapele", "Ughelli", "Agbor"] },
  { state: "Ebonyi", cities: ["Abakaliki", "Afikpo", "Onueke", "Ezza", "Ishiagu"] },
  { state: "Edo", cities: ["Benin City", "Auchi", "Ekpoma", "Uromi", "Irrua"] },
  { state: "Ekiti", cities: ["Ado-Ekiti", "Ikere-Ekiti", "Iworoko", "Oye-Ekiti", "Ilawe-Ekiti"] },
  { state: "Enugu", cities: ["Enugu", "Nsukka", "Agbani", "Udi", "Oji River"] },
  { state: "Federal Capital Territory", cities: ["Abuja", "Gwarinpa", "Wuse", "Garki", "Maitama", "Kubwa", "Lugbe"] },
  { state: "Gombe", cities: ["Gombe", "Kaltungo", "Billiri", "Dukku", "Bajoga"] },
  { state: "Imo", cities: ["Owerri", "Orlu", "Okigwe", "Mbaise", "Oguta"] },
  { state: "Jigawa", cities: ["Dutse", "Hadejia", "Gumel", "Kazaure", "Birnin Kudu"] },
  { state: "Kaduna", cities: ["Kaduna", "Zaria", "Kafanchan", "Kagoro", "Soba"] },
  { state: "Kano", cities: ["Kano", "Wudil", "Gwarzo", "Rano", "Bichi"] },
  { state: "Katsina", cities: ["Katsina", "Daura", "Funtua", "Dutsin-Ma", "Malumfashi"] },
  { state: "Kebbi", cities: ["Birnin Kebbi", "Argungu", "Yauri", "Zuru", "Jega"] },
  { state: "Kogi", cities: ["Lokoja", "Okene", "Idah", "Kabba", "Ankpa"] },
  { state: "Kwara", cities: ["Ilorin", "Offa", "Omu-Aran", "Jebba", "Lafiagi"] },
  { state: "Lagos", cities: ["Lagos", "Ikeja", "Lekki", "Victoria Island", "Yaba", "Surulere", "Ikorodu", "Epe", "Badagry"] },
  { state: "Nasarawa", cities: ["Lafia", "Keffi", "Akwanga", "Karu", "Nasarawa"] },
  { state: "Niger", cities: ["Minna", "Suleja", "Bida", "Kontagora", "Mokwa"] },
  { state: "Ogun", cities: ["Abeokuta", "Ijebu Ode", "Sagamu", "Ota", "Ilaro"] },
  { state: "Ondo", cities: ["Akure", "Ondo", "Owo", "Ikare-Akoko", "Ore"] },
  { state: "Osun", cities: ["Osogbo", "Ile-Ife", "Ilesa", "Ede", "Iwo"] },
  { state: "Oyo", cities: ["Ibadan", "Ogbomoso", "Oyo", "Iseyin", "Saki"] },
  { state: "Plateau", cities: ["Jos", "Bukuru", "Pankshin", "Shendam", "Barkin Ladi"] },
  { state: "Rivers", cities: ["Port Harcourt", "Bonny", "Eleme", "Omoku", "Bori"] },
  { state: "Sokoto", cities: ["Sokoto", "Tambuwal", "Wurno", "Gwadabawa", "Illela"] },
  { state: "Taraba", cities: ["Jalingo", "Wukari", "Bali", "Takum", "Gembu"] },
  { state: "Yobe", cities: ["Damaturu", "Potiskum", "Gashua", "Nguru", "Geidam"] },
  { state: "Zamfara", cities: ["Gusau", "Kaura Namoda", "Talata Mafara", "Anka", "Shinkafi"] },
];

export const nigeriaStateNames = nigeriaLocations.map((location) => location.state);

export function getCitiesForState(state: string) {
  return nigeriaLocations.find((location) => location.state === state)?.cities ?? [];
}

export function findStateForCity(city: string) {
  const normalizedCity = city.trim().toLowerCase();

  if (!normalizedCity) {
    return null;
  }

  return nigeriaLocations.find((location) =>
    location.cities.some((candidate) => candidate.toLowerCase() === normalizedCity)
  )?.state ?? null;
}

type LocationSuggestion = {
  state: string | null;
  city: string | null;
  stateCandidates?: string[];
  cityCandidates?: string[];
};

const stateAliases: Record<string, string> = {
  fct: "Federal Capital Territory",
  abuja: "Federal Capital Territory",
  "federal capital territory": "Federal Capital Territory",
  "abuja federal capital territory": "Federal Capital Territory",
};

export function normalizeLocationSuggestion(suggestion: LocationSuggestion) {
  const rawStateCandidates = [suggestion.state, ...(suggestion.stateCandidates ?? [])]
    .filter((value): value is string => Boolean(value?.trim()));
  const rawCityCandidates = [suggestion.city, ...(suggestion.cityCandidates ?? [])]
    .filter((value): value is string => Boolean(value?.trim()));
  const state = rawStateCandidates.map(findKnownStateName).find(Boolean) ?? cleanLocationName(rawStateCandidates[0]) ?? "";
  const knownCity = state
    ? rawCityCandidates.map((candidate) => findKnownCityName(state, candidate)).find(Boolean)
    : null;
  const city = knownCity ?? cleanLocationName(rawCityCandidates[0]) ?? "";

  return {
    state,
    city,
  };
}

function findKnownStateName(value: string) {
  const normalized = normalizeLocationName(value.replace(/\s+State$/i, ""));
  const aliased = stateAliases[normalized];

  if (aliased) {
    return aliased;
  }

  return nigeriaStateNames.find((state) => normalizeLocationName(state) === normalized) ?? null;
}

function findKnownCityName(state: string, value: string) {
  const normalized = normalizeLocationName(value);

  return getCitiesForState(state).find((city) => normalizeLocationName(city) === normalized) ?? null;
}

function cleanLocationName(value: string | undefined) {
  const trimmed = value?.replace(/\s+State$/i, "").trim();

  return trimmed || null;
}

function normalizeLocationName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+state$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
