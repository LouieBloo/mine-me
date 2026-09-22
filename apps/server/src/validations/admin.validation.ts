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
  body('canBeDamaged').optional().isBoolean().withMessage('canBeDamaged must be a boolean'),
  body('canBeClimbed').optional().isBoolean().withMessage('canBeClimbed must be a boolean'),
  body('throwable').optional().isBoolean().withMessage('throwable must be a boolean'),
  body('triggerMode').optional().isIn(['SINGLE', 'HOLD']).withMessage('triggerMode must be SINGLE or HOLD'),
  body('experience').optional().isInt({ min: 0 }).withMessage('Experience must be >= 0'),
  body('combatScore').optional().isInt({ min: 0 }).withMessage('Combat Score must be >= 0'),
  body('defenseScore').optional().isInt({ min: 0 }).withMessage('Defense Score must be >= 0'),
  body('particleEffectId').optional({ nullable: true }).isString().withMessage('particleEffectId must be a string'),
  body('physicsConfig').optional({ nullable: true }).isObject().withMessage('physicsConfig must be an object')
];

export const mobValidation = [
  body('name').trim().notEmpty().withMessage('Mob Name is required'),
  body('level').isInt({ min: 1 }).withMessage('Level must be >= 1'),
  body('health').isInt({ min: 1 }).withMessage('Health must be >= 1'),
  body('attack').isInt({ min: 0 }).withMessage('Attack must be >= 0'),
  body('defense').isInt({ min: 0 }).withMessage('Defense must be >= 0')
];

export const mobUpdateValidation = [
  body('name').optional().trim().notEmpty().withMessage('Mob Name cannot be empty'),
  body('level').optional().isInt({ min: 1 }).withMessage('Level must be >= 1'),
  body('health').optional().isInt({ min: 1 }).withMessage('Health must be >= 1'),
  body('attack').optional().isInt({ min: 0 }).withMessage('Attack must be >= 0'),
  body('defense').optional().isInt({ min: 0 }).withMessage('Defense must be >= 0')
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
  body('staminaGain').optional().isBoolean().withMessage('staminaGain must be a boolean'),
  body('miningSpeedModifier').optional().isBoolean().withMessage('miningSpeedModifier must be a boolean'),
  body('explodes').optional().isBoolean().withMessage('explodes must be a boolean')
];

export const particleEffectValidation = [
  body('name').trim().notEmpty().withMessage('Particle Effect name is required'),
  body('type').isIn(['CONTINUOUS', 'BURST']).withMessage('Type must be CONTINUOUS or BURST'),
  body('config').isObject().withMessage('Config must be a valid JSON object')
];

export const miningConfigValidation = [
  body('cavernDensity').optional().isInt({ min: 0, max: 100 }).withMessage('Cavern Density must be between 0 and 100'),
  body('cavernIterations').optional().isInt({ min: 1, max: 6 }).withMessage('Cavern Iterations must be between 1 and 6'),
  body('cavernMinDepth').optional().isInt({ min: 1, max: 20 }).withMessage('Cavern Min Depth must be between 1 and 20'),
  body('tunnelCount').optional().isInt({ min: 0, max: 30 }).withMessage('Tunnel Count must be between 0 and 30'),
  body('tunnelMinLength').optional().isInt({ min: 5, max: 100 }).withMessage('Tunnel Min Length must be between 5 and 100'),
  body('tunnelMaxLength').optional().isInt({ min: 5, max: 150 }).withMessage('Tunnel Max Length must be between 5 and 150'),
  body('tunnelWidth').optional().isInt({ min: 1, max: 3 }).withMessage('Tunnel Width must be between 1 and 3'),
  body('tunnelMinDepth').optional().isInt({ min: 1, max: 20 }).withMessage('Tunnel Min Depth must be between 1 and 20'),
  body('rockPercentage').optional().isInt({ min: 0, max: 50 }).withMessage('Rock Percentage must be between 0 and 50'),
  body('mineralPercentage').optional().isInt({ min: 0, max: 50 }).withMessage('Mineral Percentage must be between 0 and 50'),
  body('chestCount').optional().isInt({ min: 0, max: 20 }).withMessage('Chest Count must be between 0 and 20'),
  body('copperiumPercentage').optional().isInt({ min: 0, max: 30 }).withMessage('Copperium Percentage must be between 0 and 30'),
  body('silveriumPercentage').optional().isInt({ min: 0, max: 20 }).withMessage('Silverium Percentage must be between 0 and 20'),
  body('silveriumMinDepth').optional().isInt({ min: 1, max: 40 }).withMessage('Silverium Min Depth must be between 1 and 40'),
  body('oreClusterChance').optional().isInt({ min: 0, max: 100 }).withMessage('Ore Cluster Chance must be between 0 and 100'),
  body('gravityEnabled').optional().isBoolean().withMessage('Gravity Enabled must be a boolean'),
  body('gravity').optional().isFloat({ min: 0, max: 100 }).withMessage('Gravity must be between 0 and 100'),
  body('dynamiteBounciness').optional().isFloat({ min: 0, max: 1 }).withMessage('Dynamite Bounciness must be between 0 and 1'),
  body('dynamiteFriction').optional().isFloat({ min: 0, max: 1 }).withMessage('Dynamite Friction must be between 0 and 1'),
  body('dynamiteThrowPower').optional().isFloat({ min: 1, max: 50 }).withMessage('Dynamite Throw Power must be between 1 and 50'),
  body('dynamiteFuseSeconds').optional().isFloat({ min: 0.5, max: 30 }).withMessage('Dynamite Fuse Seconds must be between 0.5 and 30'),
  body('rockGravityScale').optional().isFloat({ min: 0.1, max: 5 }).withMessage('Rock Gravity Scale must be between 0.1 and 5'),
  body('rockRestitution').optional().isFloat({ min: 0, max: 1 }).withMessage('Rock Restitution must be between 0 and 1'),
];

