import { useState, useEffect } from 'react';
import { levelService } from '../services/levelService';

/**
 * Hook to track whether level configs are loaded.
 */
export function useLevelsLoaded() {
  const [isLoaded, setIsLoaded] = useState(() => levelService.isLoaded());

  useEffect(() => {
    if (!levelService.isLoaded()) {
      levelService.loadLevels();
    }

    const handleUpdate = () => {
      setIsLoaded(levelService.isLoaded());
    };

    const unsubscribe = levelService.subscribe(handleUpdate);
    return unsubscribe;
  }, []);

  return isLoaded;
}

/**
 * Hook to calculate character level reactively.
 */
export function useCharacterLevel(experience: number): number | null {
  const [level, setLevel] = useState<number | null>(() => {
    return levelService.isLoaded() ? levelService.calculateLevel(experience) : null;
  });

  useEffect(() => {
    if (!levelService.isLoaded()) {
      levelService.loadLevels();
    }

    const handleUpdate = () => {
      setLevel(levelService.calculateLevel(experience));
    };

    const unsubscribe = levelService.subscribe(handleUpdate);
    // Fetch/update immediately in case it loaded between mount and listener setup
    if (levelService.isLoaded()) {
      handleUpdate();
    }

    return unsubscribe;
  }, [experience]);

  return level;
}

/**
 * Hook to calculate level progress reactively.
 */
export function useLevelProgress(experience: number) {
  const [progress, setProgress] = useState(() => levelService.getLevelProgress(experience));

  useEffect(() => {
    if (!levelService.isLoaded()) {
      levelService.loadLevels();
    }

    const handleUpdate = () => {
      setProgress(levelService.getLevelProgress(experience));
    };

    const unsubscribe = levelService.subscribe(handleUpdate);
    if (levelService.isLoaded()) {
      handleUpdate();
    }

    return unsubscribe;
  }, [experience]);

  return progress;
}
