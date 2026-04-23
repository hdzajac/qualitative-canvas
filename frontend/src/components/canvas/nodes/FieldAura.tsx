/**
 * FieldAura — magnetic-field visualisation for aggregate cards (themes, insights).
 *
 * Visual layers:
 *  1. A thin dashed border ring — always visible when the card has members.
 *     Scales with member count so a theme with many codes has a wider territory.
 *  2. A radial-gradient fill blob — intensity driven by proximity / hover / flash.
 *  3. A box-shadow glow — intensifies at high proximity / flash.
 *
 * All animated values use @react-spring/web for genuine spring physics.
 */

import { useSpring, animated } from '@react-spring/web';

interface FieldAuraProps {
    /** 0–1: how close the dragged card is to this aggregate's centre */
    proximity: number;
    /** true when the user is hovering the aggregate card itself */
    isHovered: boolean;
    /** field ring radius in px — computed from actual child positions */
    fieldRadius: number;
    /** true for ~800 ms after a member is added or removed — drives a burst */
    isFlashing: boolean;
    /** accent colour — '#10b981' for theme, '#f59e0b' for insight */
    color: string;
}

export function FieldAura({ proximity, isHovered, fieldRadius, isFlashing, color }: FieldAuraProps) {
    const hasMembers = fieldRadius > 180; // > BASE means at least one child placed it

    // ── Effective intensity ────────────────────────────────────────────────────
    const ambientLevel = hasMembers ? 0.10 : 0;
    const hoverLevel = isHovered ? 0.32 : 0;
    const targetLevel = isFlashing
        ? 1.0
        : Math.max(proximity, hoverLevel, ambientLevel);

    // ── Springs ────────────────────────────────────────────────────────────────
    const { level } = useSpring({
        level: targetLevel,
        config: isFlashing
            ? { tension: 400, friction: 12 }
            : { tension: 220, friction: 18 },
    });

    const { borderOpacity } = useSpring({
        borderOpacity: fieldRadius > 0 ? 1 : 0,
        config: { tension: 160, friction: 26 },
    });

    // Animate the ring radius with spring physics for a satisfying expansion
    const { animatedRadius } = useSpring({
        animatedRadius: fieldRadius,
        config: { tension: 60, friction: 20 },
    });

    return (
        <>
            {/* Dashed border ring — marks territory, radius driven by child positions */}
            <animated.div
                aria-hidden
                className="absolute pointer-events-none rounded-full"
                style={{
                    inset: animatedRadius.to((r) => `${-Math.round(Math.max(r, 0))}px`),
                    opacity: borderOpacity,
                    border: `1.5px dashed ${color}66`,
                    animation: 'field-pulse 4s ease-in-out infinite',
                }}
            />

            {/* Gradient fill blob — spring driven */}
            <animated.div
                aria-hidden
                className="absolute pointer-events-none field-aura-morph"
                style={{
                    inset: animatedRadius.to((r) => `${-Math.round(Math.max(r, 0) + 20)}px`),
                    opacity: level.to((l) => l * 0.55),
                    background: `radial-gradient(circle at center, ${color}66 0%, ${color}33 40%, ${color}00 72%)`,
                    transform: level.to((l) => `scale(${0.65 + l * 0.55})`),
                    boxShadow: level.to((l) =>
                        l > 0.35
                            ? `0 0 ${Math.round(l * 64)}px ${color}55`
                            : 'none'
                    ),
                }}
            />
        </>
    );
}
