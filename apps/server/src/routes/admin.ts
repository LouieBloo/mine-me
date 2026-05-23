import express from 'express';
import { runValidation } from '../middleware/validation';
import { adminMiddleware } from '../middleware/auth';
import * as CityController from '../controllers/admin/city.controller';
import * as ItemController from '../controllers/admin/item.controller';
import * as MobController from '../controllers/admin/mob.controller';
import * as DungeonController from '../controllers/admin/dungeon.controller';
import * as UserController from '../controllers/admin/user.controller';
import * as InventoryController from '../controllers/admin/inventory.controller';
import * as CharacterController from '../controllers/admin/character.controller';
import * as CharacterLevelController from '../controllers/admin/character-level.controller';
import * as AdminValidation from '../validations/admin.validation';

const adminRouter = express.Router();
adminRouter.use(adminMiddleware);

// CITIES
adminRouter.get('/cities', CityController.getCities);
adminRouter.get('/cities/:id', CityController.getCity);
adminRouter.post('/cities', runValidation(AdminValidation.cityValidation), CityController.createCity);
adminRouter.put('/cities/:id', runValidation(AdminValidation.cityValidation), CityController.updateCity);
adminRouter.patch('/cities/:id/coordinates', runValidation(AdminValidation.cityCoordinatesValidation), CityController.updateCityCoordinates);
adminRouter.post('/cities/:id/background', CityController.cityBackgroundUpload, CityController.uploadCityBackground);
adminRouter.post('/cities/:id/map-icon', CityController.cityMapIconUpload, CityController.uploadCityMapIcon);
adminRouter.patch('/cities/:id/objects', CityController.updateCityObjects);

// CITY DUNGEONS
adminRouter.get('/cities/:id/dungeons', CityController.getCityDungeons);
adminRouter.post('/cities/:id/dungeons', CityController.addCityDungeon);
adminRouter.put('/cities/:id/dungeons/reorder', CityController.reorderCityDungeons);
adminRouter.delete('/cities/:id/dungeons/:cityDungeonId', CityController.removeCityDungeon);

// CITY MATERIALS
adminRouter.get('/cities/:id/materials', CityController.getCityMaterials);
adminRouter.post('/cities/:id/materials', CityController.addCityMaterial);
adminRouter.delete('/cities/:id/materials/:cityMaterialId', CityController.removeCityMaterial);

// ITEMS
adminRouter.get('/items', ItemController.getItems);
adminRouter.get('/item-enums', ItemController.getItemEnums);
adminRouter.get('/items/:id', ItemController.getItem);
adminRouter.post('/items', runValidation(AdminValidation.itemValidation), ItemController.createItem);
adminRouter.put('/items/:id', runValidation(AdminValidation.itemValidation), ItemController.updateItem);
adminRouter.post('/items/:id/icon', ItemController.itemIconUpload, ItemController.uploadItemIcon);
adminRouter.post('/items/:id/gear-image', ItemController.itemGearImageUpload, ItemController.uploadItemGearImage);

// MOBS
adminRouter.get('/mobs', MobController.getMobs);
adminRouter.get('/mobs/:id', MobController.getMob);
adminRouter.post('/mobs', runValidation(AdminValidation.mobValidation), MobController.createMob);
adminRouter.put('/mobs/:id', runValidation(AdminValidation.mobValidation), MobController.updateMob);
adminRouter.post('/mobs/:id/sprite-atlas', MobController.mobSpriteUpload, MobController.uploadMobSpriteAtlas);

// DUNGEONS
adminRouter.get('/dungeons', DungeonController.getDungeons);
adminRouter.get('/dungeons/:id', DungeonController.getDungeon);
adminRouter.post('/dungeons', runValidation(AdminValidation.dungeonValidation), DungeonController.createDungeon);
adminRouter.put('/dungeons/:id', runValidation(AdminValidation.dungeonValidation), DungeonController.updateDungeon);

// DUNGEON LEVELS
adminRouter.get('/dungeon-levels', DungeonController.getDungeonLevels);
adminRouter.post('/dungeon-levels', DungeonController.createDungeonLevel);
adminRouter.put('/dungeon-levels/:id', DungeonController.updateDungeonLevel);
adminRouter.delete('/dungeon-levels/:id', DungeonController.deleteDungeonLevel);

// USERS
adminRouter.get('/users', UserController.getUsers);
adminRouter.get('/users/:id', UserController.getUser);
adminRouter.post('/users', runValidation(AdminValidation.userValidation), UserController.createUser);
adminRouter.put('/users/:id', runValidation(AdminValidation.userValidation), UserController.updateUser);

// INVENTORY ITEMS
adminRouter.get('/inventory-items', InventoryController.getInventoryItems);
adminRouter.get('/inventory-items/:id', InventoryController.getInventoryItem);
adminRouter.post('/inventory-items', runValidation(AdminValidation.inventoryItemValidation), InventoryController.createInventoryItem);
adminRouter.put('/inventory-items/:id', runValidation(AdminValidation.inventoryItemValidation), InventoryController.updateInventoryItem);
adminRouter.delete('/inventory-items/:id', InventoryController.deleteInventoryItem);

// CHARACTERS
adminRouter.get('/characters', CharacterController.getCharacters);
adminRouter.get('/characters/:id', CharacterController.getCharacter);
adminRouter.put('/characters/:id', CharacterController.updateCharacter);

// CHARACTER LEVELS
adminRouter.get('/levels', CharacterLevelController.getLevels);
adminRouter.get('/levels/:id', CharacterLevelController.getLevel);
adminRouter.post('/levels', runValidation(AdminValidation.characterLevelValidation), CharacterLevelController.createLevel);
adminRouter.put('/levels/:id', runValidation(AdminValidation.characterLevelValidation), CharacterLevelController.updateLevel);
adminRouter.delete('/levels/:id', CharacterLevelController.deleteLevel);

export { adminRouter };
