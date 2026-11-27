import { fetchCommunityProjects, type CommunityProject } from '#lib/utils/communityProjects.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  let projects: CommunityProject[] = [];
  try {
    projects = await fetchCommunityProjects(fetch);
  } catch (error) {
    console.error('Error loading games:', error);
  }
  return { projects };
};
