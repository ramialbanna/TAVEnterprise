/** GoLogin Cloud slot teardown. Do not GL.exit() after a cloud run — that also stopLocal. */

const API = "https://api.gologin.com";

export async function stopCloudProfile(token, profileId) {
  const res = await fetch(`${API}/browser/${profileId}/web`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const text = await res.text();
  console.error(`cloud slot DELETE /browser/${profileId}/web → ${res.status} ${text.slice(0, 120)}`);
  return res.ok || res.status === 404;
}
