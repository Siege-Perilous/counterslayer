/** A ready-made game insert listed in static/projects/manifest.json */
export interface CommunityProject {
  id: string;
  /** Game title */
  name: string;
  /** Short blurb shown on the games page */
  description?: string;
  /** Who made the insert */
  author: string;
  /** Optional link for the author credit */
  authorUrl?: string;
  /** Photo path relative to /projects/ (e.g. "images/omaha.webp") */
  image?: string;
  /** Project JSON path relative to /projects/ */
  file: string;
}

export async function fetchCommunityProjects(fetchFn: typeof fetch = fetch): Promise<CommunityProject[]> {
  const res = await fetchFn('/projects/manifest.json');
  if (!res.ok) throw new Error(`Failed to load games list (${res.status})`);
  const data = (await res.json()) as { projects?: CommunityProject[] };
  return data.projects ?? [];
}
