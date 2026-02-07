export const CLIENT_LOCATION_MAP: Record<string, Record<string, string[]>> = {
  "SKA": {
    "OFFSHORE MEDIC": [
      "B11",
      "BARAM",
      "BARONIA",
      "BOKOR",
      "D35",
      "E11",
      "KANOWIT KAKG",
      "KASAWARI",
      "M1",
      "NC3",
      "TEMANA",
      "TUKAU"
    ],
    "ESCORT MEDIC": [
      "BINTULU",
      "MIRI"
    ],
    "IM / OHN": [
      "SKA OFFICE",
      "BIF /BCOT"
    ]
  },
  "SBA": {
    "OFFSHORE MEDIC": [
      "ERB WEST (EW)",
      "KINABALU (KNAG)",
      "SAMARANG (SM)",
      "SUMANDAK (SUPD)"
    ],
    "ESCORT MEDIC": [
      "KK",
      "LABUAN"
    ],
    "IM / OHN": [
      "SBA OFFICE",
      "SOGT"
    ]
  }
};

// Helper: get all client names
export function getClients(): string[] {
  return Object.keys(CLIENT_LOCATION_MAP).sort();
}

// Helper: get posts for a given client
export function getPostsForClient(client: string): string[] {
  const entry = CLIENT_LOCATION_MAP[client];
  if (!entry) return [];
  return Object.keys(entry).sort();
}

// Helper: get locations for a given client + post
export function getLocationsForClientPost(client: string, post: string): string[] {
  const entry = CLIENT_LOCATION_MAP[client];
  if (!entry) return [];
  const locs = entry[post];
  if (!locs) return [];
  return [...locs].sort();
}

// Helper: get all unique posts across all clients
export function getAllPosts(): string[] {
  const posts = new Set<string>();
  for (const client of Object.values(CLIENT_LOCATION_MAP)) {
    for (const post of Object.keys(client)) {
      posts.add(post);
    }
  }
  return [...posts].sort();
}

// Helper: get all unique locations across all clients
export function getAllLocations(): string[] {
  const locs = new Set<string>();
  for (const client of Object.values(CLIENT_LOCATION_MAP)) {
    for (const locList of Object.values(client)) {
      for (const loc of locList) {
        locs.add(loc);
      }
    }
  }
  return [...locs].sort();
}
