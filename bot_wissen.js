(function (global) {
    "use strict";

    const WEAPONS = [
        {
            id: "assault",
            name: "Sturmblaster",
            damage: 20,
            range: 65,
            ammo: 90
        },
        {
            id: "shotgun",
            name: "Impuls-Schrotter",
            damage: 45,
            range: 18,
            ammo: 24
        },
        {
            id: "smg",
            name: "Schnellblaster",
            damage: 12,
            range: 35,
            ammo: 120
        },
        {
            id: "sniper",
            name: "Präzisionsblaster",
            damage: 55,
            range: 120,
            ammo: 12
        }
    ];

    const PERSONALITIES = [
        {
            name: "AGGRESSIV",
            aggression: 0.9,
            courage: 0.9,
            caution: 0.2
        },
        {
            name: "VORSICHTIG",
            aggression: 0.4,
            courage: 0.3,
            caution: 0.9
        },
        {
            name: "AUSGEGLICHEN",
            aggression: 0.6,
            courage: 0.6,
            caution: 0.5
        }
    ];

    const random = (min, max) =>
        Math.random() * (max - min) + min;

    const choose = array =>
        array[Math.floor(Math.random() * array.length)];

    function distance(a, b) {
        const dx = a.x - b.x;
        const dz = a.z - b.z;

        return Math.sqrt(dx * dx + dz * dz);
    }

    class BotWissen {

        constructor() {
            this.bots = new Map();
        }

        // Erstellt einen neuen Bot
        createBot(id) {
            const personality = choose(PERSONALITIES);
            const weapon = choose(WEAPONS);

            const bot = {
                id,

                name: "BOT_" + Math.floor(random(1000, 9999)),

                health: 100,
                maxHealth: 100,

                x: random(-30, 30),
                y: 0,
                z: random(-30, 30),

                weapon: { ...weapon },
                ammo: weapon.ammo,

                personality: { ...personality },

                target: null,
                action: "explore",

                alive: true,

                decisionTimer: 0,
                attackTimer: 0,

                direction: random(0, Math.PI * 2),

                kills: 0
            };

            this.bots.set(id, bot);

            return bot;
        }

        // Gibt einen Bot zurück
        getBot(id) {
            return this.bots.get(id);
        }

        // Entfernt einen Bot
        removeBot(id) {
            this.bots.delete(id);
        }

        // Sucht den nächsten lebenden Bot
        findNearestEnemy(bot) {
            let nearest = null;
            let nearestDistance = Infinity;

            for (const other of this.bots.values()) {
                if (other.id === bot.id) continue;
                if (!other.alive) continue;

                const d = distance(bot, other);

                if (d < nearestDistance) {
                    nearestDistance = d;
                    nearest = other;
                }
            }

            return {
                target: nearest,
                distance: nearestDistance
            };
        }

        // Entscheidet über das Verhalten
        decide(bot, enemy, enemyDistance) {

            if (!enemy || !enemy.alive) {
                bot.target = null;
                bot.action = "explore";
                return;
            }

            bot.target = enemy.id;

            const personality = bot.personality;
            const healthPercent = bot.health / bot.maxHealth;

            // Keine Munition
            if (bot.ammo <= 0) {
                bot.action = "reload";
                return;
            }

            // Bei wenig Lebenspunkten eventuell fliehen
            if (
                healthPercent < 0.25 &&
                Math.random() < personality.caution
            ) {
                bot.action = "flee";
                return;
            }

            // Bei großer Entfernung bewegen
            if (enemyDistance > bot.weapon.range) {
                bot.action = "approach";
                return;
            }

            // Zufällige Entscheidung zwischen Kampf und Rückzug
            if (
                healthPercent < 0.5 &&
                Math.random() > personality.courage
            ) {
                bot.action = "flee";
                return;
            }

            // Kämpfen
            if (Math.random() < personality.aggression) {
                bot.action = "fight";
            } else {
                bot.action = "approach";
            }
        }

        // Aktualisiert das Gehirn eines Bots
        updateBot(id, deltaTime) {

            const bot = this.bots.get(id);

            if (!bot || !bot.alive) return null;

            bot.decisionTimer -= deltaTime;
            bot.attackTimer -= deltaTime;

            // Nicht jede Millisekunde neu entscheiden
            if (bot.decisionTimer <= 0) {
                const result = this.findNearestEnemy(bot);

                this.decide(
                    bot,
                    result.target,
                    result.distance
                );

                bot.decisionTimer = random(0.4, 1.2);
            }

            const enemy = this.bots.get(bot.target);

            if (
                !enemy ||
                !enemy.alive
            ) {
                bot.action = "explore";
                bot.target = null;
            }

            const result = {
                id: bot.id,
                name: bot.name,
                action: bot.action,
                target: bot.target,
                weapon: bot.weapon.id,
                position: {
                    x: bot.x,
                    y: bot.y,
                    z: bot.z
                },
                direction: bot.direction
            };

            // Bewegung in der Spielwelt
            if (bot.action === "approach" && enemy) {
                this.moveTowards(bot, enemy, deltaTime);
            }

            if (bot.action === "flee" && enemy) {
                this.moveAway(bot, enemy, deltaTime);
            }

            // Kampfaktion an das Spiel weitergeben
            if (
                bot.action === "fight" &&
                enemy &&
                bot.attackTimer <= 0
            ) {
                const d = distance(bot, enemy);

                if (
                    d <= bot.weapon.range &&
                    bot.ammo > 0
                ) {
                    result.attack = {
                        target: enemy.id,
                        damage: bot.weapon.damage
                    };

                    bot.ammo--;
                    bot.attackTimer = 0.8;
                }
            }

            return result;
        }

        // Bewegt den Bot in Richtung Gegner
        moveTowards(bot, enemy, deltaTime) {
            const dx = enemy.x - bot.x;
            const dz = enemy.z - bot.z;

            const length = Math.sqrt(dx * dx + dz * dz);

            if (length < 0.01) return;

            const speed = 5;

            bot.x += (dx / length) * speed * deltaTime;
            bot.z += (dz / length) * speed * deltaTime;

            bot.direction = Math.atan2(dx, dz);
        }

        // Bewegt den Bot vom Gegner weg
        moveAway(bot, enemy, deltaTime) {
            const dx = bot.x - enemy.x;
            const dz = bot.z - enemy.z;

            const length = Math.sqrt(dx * dx + dz * dz);

            if (length < 0.01) return;

            const speed = 6;

            bot.x += (dx / length) * speed * deltaTime;
            bot.z += (dz / length) * speed * deltaTime;

            bot.direction = Math.atan2(dx, dz);
        }

        // Bot erhält Schaden durch das Spiel
        damageBot(id, amount) {
            const bot = this.bots.get(id);

            if (!bot || !bot.alive) return;

            bot.health -= amount;

            if (bot.health <= 0) {
                bot.health = 0;
                bot.alive = false;
                bot.action = "dead";
            }
        }

        // Übersicht aller Bots
        getAllBots() {
            return Array.from(this.bots.values());
        }

        // Zufällige neue Waffe
        giveRandomWeapon(id) {
            const bot = this.bots.get(id);

            if (!bot) return;

            const weapon = choose(WEAPONS);

            bot.weapon = { ...weapon };
            bot.ammo = weapon.ammo;
        }
    }

    // Für Browser und Node.js
    global.BotWissen = BotWissen;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = BotWissen;
    }

})(typeof globalThis !== "undefined" ? globalThis : window);
