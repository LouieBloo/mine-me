import { describe, it, expect } from 'vitest';
import {
  ItemSoundSlotDefinition,
  ItemSoundProfile,
  ItemSoundProfileRegistry,
  DynamiteSoundProfile,
  WeaponSoundProfile,
} from '../ItemSoundProfile';

describe('ItemSoundProfile Object-Oriented Domain Model', () => {
  it('registers and retrieves built-in profiles from registry', () => {
    const weaponProfile = ItemSoundProfileRegistry.getProfile('WEAPON');
    expect(weaponProfile).toBeInstanceOf(WeaponSoundProfile);
    expect(weaponProfile?.title).toBe('Weapon Sound Effect');

    const dynamiteProfile = ItemSoundProfileRegistry.getProfile('dynamite'); // case-insensitive
    expect(dynamiteProfile).toBeInstanceOf(DynamiteSoundProfile);
    expect(dynamiteProfile?.title).toBe('Dynamite Sound Effects');

    expect(ItemSoundProfileRegistry.getProfile('UNKNOWN_SUBTYPE')).toBeNull();
    expect(ItemSoundProfileRegistry.hasProfile('DYNAMITE')).toBe(true);
    expect(ItemSoundProfileRegistry.hasProfile('NON_EXISTENT')).toBe(false);
  });

  it('correctly defines all 3 sound slots for Dynamite', () => {
    const profile = new DynamiteSoundProfile();
    const slots = profile.getSlots();

    expect(slots).toHaveLength(3);
    const slotKeys = slots.map((s) => s.slotKey);
    expect(slotKeys).toEqual(['throw', 'inGameEffect', 'explosion']);

    const throwSlot = profile.getSlot('throw');
    expect(throwSlot).toBeDefined();
    expect(throwSlot?.label).toBe('Throw Sound');
    expect(throwSlot?.defaultLoop).toBe(false);
    expect(throwSlot?.loopToggleable).toBe(false);

    const fuseSlot = profile.getSlot('inGameEffect');
    expect(fuseSlot).toBeDefined();
    expect(fuseSlot?.label).toBe('In-Game Effect (Fuse)');
    expect(fuseSlot?.defaultLoop).toBe(true);
    expect(fuseSlot?.loopToggleable).toBe(true);

    const explosionSlot = profile.getSlot('explosion');
    expect(explosionSlot).toBeDefined();
    expect(explosionSlot?.label).toBe('Explosion Sound');
    expect(explosionSlot?.defaultLoop).toBe(false);
    expect(explosionSlot?.loopToggleable).toBe(false);
  });

  it('normalizes config with defaults and backward-compatible fallbacks', () => {
    const profile = new DynamiteSoundProfile();

    // With legacy soundEffectUrl for throw slot
    const normalizedWithFallback = profile.normalizeConfig({}, '/assets/sounds/items/legacy_throw.mp3');
    expect(normalizedWithFallback.throw?.url).toBe('/assets/sounds/items/legacy_throw.mp3');
    expect(normalizedWithFallback.throw?.loop).toBe(false);
    expect(normalizedWithFallback.inGameEffect?.url).toBeNull();
    expect(normalizedWithFallback.inGameEffect?.loop).toBe(true); // default loop for fuse
    expect(normalizedWithFallback.explosion?.url).toBeNull();
    expect(normalizedWithFallback.explosion?.loop).toBe(false);

    // With explicit config provided
    const explicitConfig = {
      throw: { url: '/assets/sounds/items/custom_throw.wav', loop: false },
      inGameEffect: { url: '/assets/sounds/items/fuse.mp3', loop: false }, // explicitly unlooped
      explosion: { url: '/assets/sounds/items/boom.mp3', loop: false },
    };
    const normalizedExplicit = profile.normalizeConfig(explicitConfig);
    expect(normalizedExplicit.throw?.url).toBe('/assets/sounds/items/custom_throw.wav');
    expect(normalizedExplicit.inGameEffect?.url).toBe('/assets/sounds/items/fuse.mp3');
    expect(normalizedExplicit.inGameEffect?.loop).toBe(false);
    expect(normalizedExplicit.explosion?.url).toBe('/assets/sounds/items/boom.mp3');
  });

  it('allows registering custom sound profiles dynamically', () => {
    class BowSoundProfile extends ItemSoundProfile {
      public readonly subType = 'BOW';
      public readonly title = 'Bow & Arrow Sounds';
      public readonly description = 'Custom sounds for ranged bows';
      public getSlots(): ItemSoundSlotDefinition[] {
        return [
          new ItemSoundSlotDefinition({
            slotKey: 'throw',
            label: 'Bow Draw & Release',
            description: 'Sound when arrow is fired',
          }),
        ];
      }
    }

    ItemSoundProfileRegistry.register(new BowSoundProfile());
    const registered = ItemSoundProfileRegistry.getProfile('BOW');
    expect(registered).toBeInstanceOf(BowSoundProfile);
    expect(registered?.title).toBe('Bow & Arrow Sounds');
  });
});
