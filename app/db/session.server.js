import { Session } from "@shopify/shopify-api";

export class D1SessionStorage {
    constructor(db) {
        this.db = db;
    }

    async storeSession(session) {
        await this.db.prepare(`
      INSERT INTO sessions (id, shop, state, isOnline, scope, expires, accessToken, userId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        shop = excluded.shop,
        state = excluded.state,
        isOnline = excluded.isOnline,
        scope = excluded.scope,
        expires = excluded.expires,
        accessToken = excluded.accessToken,
        userId = excluded.userId
    `).bind(
            session.id,
            session.shop,
            session.state,
            session.isOnline ? 1 : 0,
            session.scope,
            session.expires ? session.expires.getTime() : null,
            session.accessToken,
            session.onlineAccessInfo?.associated_user?.id || null
        ).run();
        return true;
    }

    async loadSession(id) {
        const row = await this.db.prepare("SELECT * FROM sessions WHERE id = ?").bind(id).first();
        if (!row) return undefined;

        const session = new Session(row.id);
        session.shop = row.shop;
        session.state = row.state;
        session.isOnline = row.isOnline === 1;
        session.scope = row.scope;
        session.expires = row.expires ? new Date(row.expires) : undefined;
        session.accessToken = row.accessToken;

        if (row.userId) {
            session.onlineAccessInfo = { associated_user: { id: row.userId } };
        }

        return session;
    }

    async deleteSession(id) {
        await this.db.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
        return true;
    }

    async deleteSessions(ids) {
        const placeholders = ids.map(() => "?").join(",");
        await this.db.prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`).bind(...ids).run();
        return true;
    }

    async findSessionsByShop(shop) {
        const rows = await this.db.prepare("SELECT * FROM sessions WHERE shop = ?").bind(shop).all();
        return rows.results.map(row => {
            const session = new Session(row.id);
            session.shop = row.shop;
            session.state = row.state;
            session.isOnline = row.isOnline === 1;
            session.scope = row.scope;
            session.expires = row.expires ? new Date(row.expires) : undefined;
            session.accessToken = row.accessToken;
            return session;
        });
    }
}
