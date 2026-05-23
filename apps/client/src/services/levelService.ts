export interface CharacterLevelConfig {
  id: string;
  level: number;
  xpRequired: number;
}

class LevelService {
  private levels: CharacterLevelConfig[] = [];
  private listeners: Set<() => void> = new Set();
  private loading = false;
  private loaded = false;

  public async loadLevels(): Promise<CharacterLevelConfig[]> {
    if (this.loaded) return this.levels;
    if (this.loading) {
      return new Promise((resolve) => {
        const check = () => {
          if (this.loaded) resolve(this.levels);
          else setTimeout(check, 50);
        };
        check();
      });
    }

    this.loading = true;
    try {
      const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      const response = await fetch(`${apiBaseUrl}/api/public/levels`);
      if (response.ok) {
        this.levels = await response.json();
        // Sort ascending by level number
        this.levels.sort((a, b) => a.level - b.level);
        this.loaded = true;
        this.notifyListeners();
      }
    } catch (error) {
      console.error('Failed to fetch character levels:', error);
    } finally {
      this.loading = false;
    }
    return this.levels;
  }

  public getLevels(): CharacterLevelConfig[] {
    if (!this.loaded && !this.loading) {
      this.loadLevels();
    }
    return this.levels;
  }

  public isLoaded(): boolean {
    return this.loaded;
  }

  public calculateLevel(experience: number): number {
    const levels = this.getLevels();
    if (levels.length === 0) {
      return 1;
    }
    // If experience is below the lowest configured level
    if (experience < levels[0].xpRequired) {
      return Math.max(0, levels[0].level - 1);
    }
    // Search backward for the highest level reached
    for (let i = levels.length - 1; i >= 0; i--) {
      if (experience >= levels[i].xpRequired) {
        return levels[i].level;
      }
    }
    return Math.max(0, levels[0].level - 1);
  }

  public getLevelProgress(experience: number) {
    const levels = this.getLevels();
    if (levels.length === 0) {
      // If levels config is not loaded yet, return a loading skeleton state
      return {
        level: 1,
        currentXp: experience,
        xpForCurrentLevel: 0,
        xpForNextLevel: 0,
        xpIntoLevel: 0,
        xpNeededForNext: 0,
        progress: 0,
        isMaxLevel: false,
        maxLevel: 1,
        loading: true
      };
    }

    const currentLevelNum = this.calculateLevel(experience);
    const maxConfig = levels[levels.length - 1];
    const maxLevelNum = maxConfig ? maxConfig.level : 1;
    const isMaxLevel = currentLevelNum >= maxLevelNum;

    // Handle case where experience is below the first level threshold
    if (experience < levels[0].xpRequired) {
      const xpForCurrentLevel = 0;
      const xpForNextLevel = levels[0].xpRequired;
      const xpIntoLevel = experience;
      const xpNeededForNext = xpForNextLevel;
      const progress = xpNeededForNext > 0 ? xpIntoLevel / xpNeededForNext : 0;

      return {
        level: currentLevelNum,
        currentXp: experience,
        xpForCurrentLevel,
        xpForNextLevel,
        xpIntoLevel,
        xpNeededForNext,
        progress: Math.min(1, Math.max(0, progress)),
        isMaxLevel: false,
        maxLevel: maxLevelNum,
        loading: false
      };
    }

    const currentConfig = levels.find(l => l.level === currentLevelNum);
    const nextConfig = levels.find(l => l.level === currentLevelNum + 1);

    const xpForCurrentLevel = currentConfig ? currentConfig.xpRequired : 0;
    const xpForNextLevel = isMaxLevel
      ? xpForCurrentLevel
      : (nextConfig ? nextConfig.xpRequired : xpForCurrentLevel);

    const xpIntoLevel = experience - xpForCurrentLevel;
    const xpNeededForNext = xpForNextLevel - xpForCurrentLevel;
    const progress = isMaxLevel ? 1 : xpNeededForNext > 0 ? xpIntoLevel / xpNeededForNext : 0;

    return {
      level: currentLevelNum,
      currentXp: experience,
      xpForCurrentLevel,
      xpForNextLevel,
      xpIntoLevel,
      xpNeededForNext,
      progress: Math.min(1, Math.max(0, progress)),
      isMaxLevel,
      maxLevel: maxLevelNum,
      loading: false
    };
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(l => l());
  }
}

export const levelService = new LevelService();
