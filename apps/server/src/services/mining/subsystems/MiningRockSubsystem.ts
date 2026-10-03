import {
  MINING_CONFIG,
  MiningTileType,
  isTileSolid,
  type MiningRigidWorld,
} from '@mine-me/shared';
import { isInBounds, type ServerMiningGrid } from '../../miningMap.service';
import { MiningRockEntity } from '../physics/MiningRockEntity';
import type { MiningPlayerSession } from './MiningPlayerManager';
import type { PendingTileUpdate } from './MiningBlockSubsystem';

export class MiningRockSubsystem {
  public activeRocks: MiningRockEntity[] = [];
  public rockCounter = 0;

  public checkAndTriggerFallingRocks(
    clearedX: number,
    clearedY: number,
    grid: ServerMiningGrid,
    rigidWorld: MiningRigidWorld,
    onPendingTile: (update: PendingTileUpdate) => void
  ): void {
    for (let y = clearedY - 1; y >= 0; y--) {
      if (grid[y][clearedX].type === MiningTileType.ROCK) {
        grid[y][clearedX] = { type: MiningTileType.EMPTY, revealed: true };
        rigidWorld.removeTileCollider(clearedX, y);
        onPendingTile({ x: clearedX, y, type: MiningTileType.EMPTY, damageStage: 0 });

        this.rockCounter++;
        const rockId = `rock_${clearedX}_${y}_${this.rockCounter}`;
        const rockEntity = new MiningRockEntity(rockId, clearedX, y, rigidWorld, {
          gravityScale: rigidWorld.config.rockGravityScale,
          restitution: rigidWorld.config.rockRestitution,
        });
        this.activeRocks.push(rockEntity);
      } else if (isTileSolid(grid[y][clearedX].type)) {
        break;
      }
    }
  }

  public updateFallingRocks(
    dt: number,
    grid: ServerMiningGrid,
    rigidWorld: MiningRigidWorld,
    players: Iterable<MiningPlayerSession>,
    onPendingTile: (update: PendingTileUpdate) => void
  ): void {
    if (this.activeRocks.length === 0) return;

    this.activeRocks = this.activeRocks.filter((rock) => {
      rock.update(dt, grid);

      // Check if rock crushed ANY active player
      for (const session of players) {
        const dist = Math.hypot(
          rock.position.x - session.playerBody.position.x,
          rock.position.y - session.playerBody.position.y
        );
        if (dist < 0.6 && rock.velocity.y > 2.0 && rock.totalFallenDistance > 0.5) {
          if (session.socket && session.socket.connected) {
            session.socket.emit('mining_event_result', {
              success: true,
              data: {
                damageTaken: MINING_CONFIG.ROCK_CRUSH_DAMAGE,
                message: 'You were hit by a falling rock!',
              },
            });
          }
        }
      }

      if (rock.hasSettled && rock.settledTile) {
        const { x, y } = rock.settledTile;
        if (isInBounds(x, y)) {
          grid[y][x] = { type: MiningTileType.ROCK, revealed: true };
          rigidWorld.addTileCollider(x, y);
          onPendingTile({ x, y, type: MiningTileType.ROCK });
        }
        return false;
      }
      return true;
    });
  }
}
