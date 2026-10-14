import * as planck from 'planck';
import { MINING_CONFIG } from '../types/mining';
import { sampleFluidContact, type FluidEnvironment } from '../gameLogic/fluid/fluidSubmersion';

/** Rigid bodies the fluid acts on (tile colliders are static and never move). */
const AFFECTED_TYPES = new Set(['item', 'rock', 'dynamite']);

/**
 * Applies buoyancy and drag to every loose body (dropped items, rocks, dynamite) that is in fluid. Call it
 * once per tick, just before the physics world steps.
 *
 *  - Buoyancy is Archimedes: the fluid pushes up with the weight of the fluid the body displaces, so a body
 *    lighter than the fluid (its fixture density below the fluid's) floats, and a heavier one sinks more slowly.
 *  - Drag brakes the body in proportion to the fluid's viscosity and how deep the body is.
 *
 * Bodies in fluid are kept awake so they keep reacting as the fluid moves. Returns how many bodies were acted on.
 */
export function applyFluidForces(world: planck.World, environment: FluidEnvironment): number {
  const gravityY = world.getGravity().y;
  let affected = 0;
  for (let body = world.getBodyList(); body; body = body.getNext()) {
    if (!body.isDynamic()) continue;
    const data = body.getUserData() as { type?: string } | null;
    if (!data?.type || !AFFECTED_TYPES.has(data.type)) continue;
    const fixture = body.getFixtureList();
    if (!fixture) continue;

    const box = fixture.getAABB(0);
    const halfWidth = (box.upperBound.x - box.lowerBound.x) / 2;
    const halfHeight = (box.upperBound.y - box.lowerBound.y) / 2;
    const centerX = (box.upperBound.x + box.lowerBound.x) / 2;
    const centerY = (box.upperBound.y + box.lowerBound.y) / 2;

    const contact = sampleFluidContact(environment.sampler, centerX, centerY, halfWidth, halfHeight);
    if (!contact) continue;
    const fluid = environment.propertiesOf(contact.fluidId);
    const bodyDensity = fixture.getDensity();
    if (!fluid || !(bodyDensity > 0)) continue;

    const mass = body.getMass();
    const velocity = body.getLinearVelocity();
    // Upward push as a share of the body's own weight, then spread over the body's gravity scale
    const lift = (fluid.density / bodyDensity) * contact.submerged * mass * gravityY * body.getGravityScale();
    const drag = MINING_CONFIG.FLUID_BODY_DRAG * fluid.viscosity * contact.submerged * mass;
    body.applyForceToCenter(planck.Vec2(-velocity.x * drag, -lift - velocity.y * drag), true);
    affected++;
  }
  return affected;
}
