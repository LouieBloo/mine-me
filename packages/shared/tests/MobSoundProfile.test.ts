import { describe, it, expect } from 'vitest';
import {
  GenericMobSoundProfile,
  MolePersonSoundProfile,
  MobSoundProfileRegistry,
} from '../src/sound/MobSoundProfile';
import { MINING_SPATIAL_AUDIO_PRESETS } from '../src/types/sound';

describe('MobSoundProfile and MolePersonSoundProfile', () => {
  it('registers slots properly on GenericMobSoundProfile', () => {
    const profile = new GenericMobSoundProfile('test_mob', 'Test Mob');
    profile.registerSlot({
      slotKey: 'dig',
      label: 'Digging',
      description: 'Hand digging test sound',
      defaultUrl: '/assets/sounds/test_dig.mp3',
    });

    expect(profile.mobId).toBe('test_mob');
    expect(profile.title).toBe('Test Mob');
    expect(profile.hasSlot('dig')).toBe(true);
    expect(profile.hasSlot('idle')).toBe(false);

    const slot = profile.getSlot('dig');
    expect(slot?.defaultUrl).toBe('/assets/sounds/test_dig.mp3');
    expect(slot?.label).toBe('Digging');
  });

  it('instantiates MolePersonSoundProfile with specialized dig, idle, and damage sound slots', () => {
    const moleProfile = new MolePersonSoundProfile();
    expect(moleProfile.mobId).toBe('cmn_mole_person_001');
    expect(moleProfile.title).toBe('Mole Person Sound Effects');

    expect(moleProfile.hasSlot('dig')).toBe(true);
    expect(moleProfile.hasSlot('idle')).toBe(true);
    expect(moleProfile.hasSlot('damage')).toBe(true);

    const digSlot = moleProfile.getSlot('dig');
    expect(digSlot?.defaultUrl).toContain('cmn_mole_person_dig.mp3');
    expect(digSlot?.label).toContain('Hand Digging');

    const idleSlot = moleProfile.getSlot('idle');
    expect(idleSlot?.defaultUrl).toContain('cmn_mole_person_idle.mp3');
    expect(idleSlot?.label).toContain('Idle');

    const damageSlot = moleProfile.getSlot('damage');
    expect(damageSlot?.defaultUrl).toContain('cmn_mole_person_damage.mp3');
    expect(damageSlot?.label).toContain('Damage');
  });

  it('normalizes incoming config with custom overrides and default fallbacks', () => {
    const moleProfile = new MolePersonSoundProfile();
    const config = moleProfile.normalizeConfig({
      dig: { url: '/custom/mole_claw.mp3', loop: true },
    });

    expect(config.dig?.url).toBe('/custom/mole_claw.mp3');
    expect(config.dig?.loop).toBe(true);
    // Unspecified slots take defaults
    expect(config.idle?.url).toBe('/assets/sounds/cmn_mole_person_idle.mp3');
    expect(config.idle?.loop).toBe(false);
    expect(config.damage?.url).toBe('/assets/sounds/cmn_mole_person_damage.mp3');
  });

  it('returns all registered slots via getSlots', () => {
    const moleProfile = new MolePersonSoundProfile();
    const slots = moleProfile.getSlots();
    const keys = slots.map((s) => s.slotKey);
    expect(keys.sort()).toEqual(['damage', 'dig', 'idle'].sort());
  });
});

describe('MobSoundProfileRegistry', () => {
  it('retrieves pre-registered MolePersonSoundProfile by mobId', () => {
    const profile = MobSoundProfileRegistry.getProfile('cmn_mole_person_001');
    expect(profile).toBeDefined();
    expect(profile?.mobId).toBe('cmn_mole_person_001');
    expect(profile?.getSlot('dig')?.defaultUrl).toBe('/assets/sounds/cmn_mole_person_dig.mp3');
  });

  it('allows registering and retrieving custom mob sound profiles', () => {
    const customBat = new GenericMobSoundProfile('cmn_cave_bat_001', 'Cave Bat');
    customBat.registerSlot({
      slotKey: 'idle',
      label: 'Screech',
      description: 'Bat echolocation screech',
      defaultUrl: '/assets/sounds/bat_chirp.mp3',
    });

    MobSoundProfileRegistry.register(customBat);
    const profile = MobSoundProfileRegistry.getProfile('cmn_cave_bat_001');
    expect(profile).toBeDefined();
    expect(profile?.getSlot('idle')?.defaultUrl).toBe('/assets/sounds/bat_chirp.mp3');
  });

  it('falls back to default profile when unmapped mobId is queried', () => {
    const fallback = MobSoundProfileRegistry.getOrCreateDefault('unknown_mob_999');
    expect(fallback.mobId).toBe('unknown_mob_999');
    expect(fallback.hasSlot('dig')).toBe(true);
    expect(fallback.hasSlot('idle')).toBe(true);
    expect(fallback.hasSlot('damage')).toBe(true);
  });
});

describe('MINING_SPATIAL_AUDIO_PRESETS for Mobs', () => {
  it('has valid spatial configurations for mob audio cues', () => {
    expect(MINING_SPATIAL_AUDIO_PRESETS.MOB_DIGGING).toBeDefined();
    expect(MINING_SPATIAL_AUDIO_PRESETS.MOB_DIGGING.maxDistance).toBeGreaterThan(0);
    expect(MINING_SPATIAL_AUDIO_PRESETS.MOB_DIGGING.minDistance).toBeGreaterThan(0);

    expect(MINING_SPATIAL_AUDIO_PRESETS.MOB_IDLE).toBeDefined();
    expect(MINING_SPATIAL_AUDIO_PRESETS.MOB_DAMAGE).toBeDefined();
    expect(MINING_SPATIAL_AUDIO_PRESETS.MOB_DAMAGE.maxDistance).toBeGreaterThanOrEqual(
      MINING_SPATIAL_AUDIO_PRESETS.MOB_DIGGING.maxDistance
    );
  });
});
