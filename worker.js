const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

async function getConfig(env) {
  const result = await env.DB
    .prepare(`
      SELECT
        enabled,
        maintenance,
        maintenance_message,
        minimum_version_code,
        update_url,
        force_update,
        message,
        message_type,
        updated_at
      FROM app_config
      WHERE id = 1
    `)
    .first();

  return result;
}

async function adminAuth(request, env) {
  const auth = request.headers.get("Authorization");

  if (!auth || !auth.startsWith("Bearer ")) {
    return false;
  }

  const token = auth.substring(7);

  return token === env.ADMIN_TOKEN;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // اختبار السيرفر
      if (path === "/" && request.method === "GET") {
        return json({
          ok: true,
          service: "VaultDecrypt Control Server",
          version: "1.0.0",
        });
      }

      // التطبيق يستخدم هذا الرابط لمعرفة حالته
      if (path === "/api/app/config" && request.method === "GET") {
        const config = await getConfig(env);

        if (!config) {
          return json({
            ok: false,
            error: "Configuration not found",
          }, 500);
        }

        return json({
          ok: true,
          config,
        });
      }

      // لوحة التحكم - قراءة الإعدادات
      if (path === "/api/admin/config" && request.method === "GET") {
        if (!(await adminAuth(request, env))) {
          return json({
            ok: false,
            error: "Unauthorized",
          }, 401);
        }

        const config = await getConfig(env);

        return json({
          ok: true,
          config,
        });
      }

      // لوحة التحكم - تعديل الإعدادات
      if (path === "/api/admin/config" && request.method === "POST") {
        if (!(await adminAuth(request, env))) {
          return json({
            ok: false,
            error: "Unauthorized",
          }, 401);
        }

        const body = await request.json();

        const enabled =
          body.enabled === undefined
            ? 1
            : body.enabled ? 1 : 0;

        const maintenance =
          body.maintenance === undefined
            ? 0
            : body.maintenance ? 1 : 0;

        const maintenanceMessage =
          body.maintenance_message ?? "";

        const minimumVersionCode =
          Number(body.minimum_version_code ?? 1);

        const updateUrl =
          body.update_url ?? "";

        const forceUpdate =
          body.force_update ? 1 : 0;

        const message =
          body.message ?? "";

        const messageType =
          body.message_type ?? "info";

        await env.DB
          .prepare(`
            UPDATE app_config
            SET
              enabled = ?,
              maintenance = ?,
              maintenance_message = ?,
              minimum_version_code = ?,
              update_url = ?,
              force_update = ?,
              message = ?,
              message_type = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
          `)
          .bind(
            enabled,
            maintenance,
            maintenanceMessage,
            minimumVersionCode,
            updateUrl,
            forceUpdate,
            message,
            messageType
          )
          .run();

        const config = await getConfig(env);

        return json({
          ok: true,
          message: "Configuration updated",
          config,
        });
      }

      return json({
        ok: false,
        error: "Not Found",
      }, 404);

    } catch (error) {
      console.error(error);

      return json({
        ok: false,
        error: "Internal Server Error",
      }, 500);
    }
  },
};
