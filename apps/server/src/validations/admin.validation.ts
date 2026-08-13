import { body } from 'express-validator';
import { ITEM_TYPES, ITEM_SUBTYPES, ITEM_RARITIES } from '@mine-me/shared';

export const cityValidation = [
  body('name').trim().notEmpty().withMessage('City Name is required'),
  body('description').trim().notEmpty().withMessage('Description is required')
];

export const cityCoordinatesValidation = [
  body('worldPositionX').isInt({ min: 0, max: 100 }).withMessage('World Position X must be between 0 and 100'),
  body('worldPositionY').isInt({ min: 0, max: 100 }).withMessage('World Position Y must be between 0 and 100')
];

export const itemValidation = [
  body('name').trim().notEmpty().withMessage('Item Name is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('type').isIn(ITEM_TYPES).withMessage(`Type must be one of: ${ITEM_TYPES.join(', ')}`),
  body('subType').custom((value, { req }) => {
    const type = req.body.type;
    if (!type || !ITEM_SUBTYPES[type as keyof typeof ITEM_SUBTYPES]) return true;
    const validSubs = ITEM_SUBTYPES[type as keyof typeof ITEM_SUBTYPES];
    if (!validSubs.includes(value)) {
      throw new Error(`Sub Type must be one of: ${validSubs.join(', ')}`);
    }
    return true;
  }),
  body('vendorBuyPrice').isInt({ min: 0 }).withMessage('Vendor Buy Price must be >= 0'),
  body('vendorSellPrice').isInt({ min: 0 }).withMessage('Vendor Sell Price must be >= 0'),
  body('userBuyPrice').isInt({ min: 0 }).withMessage('User Buy Price must be >= 0'),
  body('userSellPrice').isInt({ min: 0 }).withMessage('User Sell Price must be >= 0'),
  body('rarity').isIn(ITEM_RARITIES).withMessage(`Rarity must be one of: ${ITEM_RARITIES.join(', ')}`),
  body('isStartingPiece').optional().isBoolean().withMessage('isStartingPiece must be a boolean'),
  body('experience').optional().isInt({ min: 0 }).withMessage('Experience must be >= 0'),
  body('combatScore').optional().isInt({ min: 0 }).withMessage('Combat Score must be >= 0'),
  body('defenseScore').optional().isInt({ min: 0 }).withMessage('Defense Score must be >= 0')
];

export const mobValidation = [
  body('name').trim().notEmpty().withMessage('Mob Name is required'),
  body('level').isInt({ min: 1 }).withMessage('Level must be >= 1'),
  body('health').isInt({ min: 1 }).withMessage('Health must be >= 1'),
  body('attack').isInt({ min: 0 }).withMessage('Attack must be >= 0'),
  body('defense').isInt({ min: 0 }).withMessage('Defense must be >= 0')
];

export const dungeonValidation = [
  body('name').trim().notEmpty().withMessage('Dungeon Name is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('minLevel').isInt({ min: 1 }).withMessage('Min Level must be >= 1')
];

export const userValidation = [
  body('phoneNumber').trim().notEmpty().withMessage('Phone Number is required'),
  body('familyName').trim().notEmpty().withMessage('Family Name is required')
];

export const inventoryItemValidation = [
  body('characterId').trim().notEmpty().withMessage('Character ID is required'),
  body('itemId').trim().notEmpty().withMessage('Item ID is required'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be >= 1')
];

export const characterLevelValidation = [
  body('level').isInt({ min: 1 }).withMessage('Level must be >= 1'),
  body('xpRequired').isInt({ min: 0 }).withMessage('XP Required must be >= 0')
];

export const effectValidation = [
  body('name').trim().notEmpty().withMessage('Effect name is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('healthGain').optional().isBoolean().withMessage('healthGain must be a boolean'),
  body('staminaGain').optional().isBoolean().withMessage('staminaGain must be a boolean')
];
