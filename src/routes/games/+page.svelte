<script lang="ts">
  /* eslint-disable svelte/no-navigation-without-resolve -- hrefs are resolve('/') plus a query string */
  import { resolve } from '$app/paths';
  import { Icon, Link, Spacer, Text, Title } from '@tableslayer/ui';
  import { IconPhoto } from '@tabler/icons-svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Counter Slayer games</title>
  <meta name="description" content="Ready-made board game inserts you can open and customize in Counter Slayer." />
</svelte:head>

<div class="gamesPage">
  <div class="gamesPage__container">
    <Title as="h1" size="md">Games</Title>
    <Spacer size="0.5rem" />
    <Text color="var(--fgMuted)">
      Ready-made inserts from the community. Open one in the editor to tweak and print it. Opening a game replaces the
      project you are working on, so export it first if you want to keep it.
    </Text>
    <Spacer size="2rem" />

    {#if data.projects.length > 0}
      <ul class="gamesPage__grid">
        {#each data.projects as project (project.id)}
          <li class="gameCard">
            <a
              class="gameCard__photo"
              href={`${resolve('/')}?project=${encodeURIComponent(project.id)}`}
              tabindex="-1"
              aria-hidden="true"
            >
              {#if project.image}
                <img src="/projects/{project.image}" alt="" loading="lazy" />
              {:else}
                <span class="gameCard__photoPlaceholder">
                  <Icon Icon={IconPhoto} size="2rem" />
                </span>
              {/if}
            </a>
            <div class="gameCard__body">
              <a class="gameCard__title" href={`${resolve('/')}?project=${encodeURIComponent(project.id)}`}>
                {project.name}
              </a>
              {#if project.description}
                <p class="gameCard__description">{project.description}</p>
              {/if}
              <p class="gameCard__credits">
                Insert by
                {#if project.authorUrl}
                  <Link href={project.authorUrl} target="_blank" rel="noopener noreferrer">{project.author}</Link>
                {:else}
                  {project.author}
                {/if}
              </p>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <Text>No games yet. Check back soon!</Text>
    {/if}
  </div>
</div>

<style>
  .gamesPage {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .gamesPage__container {
    max-width: 72rem;
    margin: 0 auto;
    padding: 3rem 2rem;
  }

  .gamesPage__grid {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: 1.5rem;
  }

  .gameCard {
    position: relative;
    display: flex;
    flex-direction: column;
    border: var(--borderThin);
    border-radius: 0.5rem;
    overflow: hidden;
    background: var(--bg);
    transition: border-color 0.15s;
  }

  .gameCard:hover,
  .gameCard:focus-within {
    border-color: var(--fgPrimary);
  }

  .gameCard__photo {
    display: block;
    aspect-ratio: 4 / 3;
    background: var(--contrastLow);
    border-bottom: var(--borderThin);
  }

  .gameCard__photo img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .gameCard__photoPlaceholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--fgMuted);
  }

  .gameCard__body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    flex: 1;
  }

  .gameCard__title {
    color: var(--fg);
    font-weight: 600;
    font-size: 1.125rem;
    line-height: 1.3;
    text-decoration: none;
  }

  /* Stretch the title link over the whole card so any click opens the game */
  .gameCard__title::after {
    content: '';
    position: absolute;
    inset: 0;
  }

  .gameCard__title:hover {
    text-decoration: underline;
  }

  .gameCard__description {
    margin: 0;
    color: var(--fgMuted);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .gameCard__credits {
    margin: auto 0 0;
    padding-top: 0.5rem;
    color: var(--fgMuted);
    font-size: 0.8125rem;
  }

  /* Keep the author link clickable above the stretched title link */
  .gameCard__credits :global(a) {
    position: relative;
    z-index: 1;
  }

  @media (max-width: 600px) {
    .gamesPage__container {
      padding: 2rem 1rem;
    }
  }
</style>
