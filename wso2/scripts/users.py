"""Create the 'analyst' and 'manager' roles, the analyst1 / manager1 test users
and the ai-agent-svc service account.

API Manager 4.6.0 manages users through the RemoteUserStoreManagerService
admin service (SOAP), authenticated with the admin account. On re-runs, users
that already exist get their password reset to the value in .env and their
role checked, so .env stays the single source of truth.
"""

from __future__ import annotations

import re
from xml.sax.saxutils import escape

import httpx

from common import MGMT_URL, ApiError, env, info, step

SERVICE_URL = f"{MGMT_URL}/services/RemoteUserStoreManagerService.RemoteUserStoreManagerServiceHttpsSoap11Endpoint"
NS = "http://service.ws.um.carbon.wso2.org"

ROLES = ["analyst", "manager"]
# ai-agent-svc is a service account that owns the "AI Agent" application.
# Client-credentials tokens carry the owner's roles, so giving it only the
# analyst role means an AI agent can never obtain customer:read. Its password
# is random and never used to sign in interactively.
USERS = {
    "analyst1": (["analyst"], "ANALYST1_PASSWORD"),
    "manager1": (["manager"], "MANAGER1_PASSWORD"),
    "ai-agent-svc": (["analyst", "Internal/subscriber"], "AI_AGENT_SERVICE_PASSWORD"),
}


class UserAdmin:
    def __init__(self, username: str, password: str) -> None:
        self.http = httpx.Client(verify=False, timeout=30, auth=(username, password))  # local self-signed cert

    def call(self, operation: str, body: str = "") -> str:
        envelope = (
            f'<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="{NS}">'
            f"<soapenv:Body><ser:{operation}>{body}</ser:{operation}></soapenv:Body></soapenv:Envelope>"
        )
        response = self.http.post(SERVICE_URL, content=envelope,
                                  headers={"Content-Type": "text/xml", "SOAPAction": f"urn:{operation}"})
        # One-way operations (addRole, addUser, ...) answer 202 Accepted with no body.
        if response.status_code not in (200, 202):
            raise ApiError(f"{operation} failed: {response.status_code} {response.text[:500]}")
        return response.text

    def returns(self, operation: str, body: str = "") -> list[str]:
        return re.findall(r"<ns:return>(.*?)</ns:return>", self.call(operation, body))

    def exists(self, operation: str, tag: str, name: str) -> bool:
        return self.returns(operation, f"<ser:{tag}>{escape(name)}</ser:{tag}>") == ["true"]


def run() -> None:
    step("Roles and test users")
    values = env()
    admin = UserAdmin(values["WSO2_ADMIN_USERNAME"], values["WSO2_ADMIN_PASSWORD"])

    for role in ROLES:
        if admin.exists("isExistingRole", "roleName", role):
            info(f"role '{role}' exists")
        else:
            admin.call("addRole", f"<ser:roleName>{role}</ser:roleName>")
            if not admin.exists("isExistingRole", "roleName", role):
                raise ApiError(f"role '{role}' was not created")
            info(f"role '{role}' created")

    for user, (roles, password_key) in USERS.items():
        password = values.get(password_key, "")
        if len(password) < 5:
            raise SystemExit(f"{password_key} is missing in .env. Run generate_env.py first.")
        pwd = escape(password)
        if admin.exists("isExistingUser", "userName", user):
            admin.call("updateCredentialByAdmin",
                       f"<ser:userName>{user}</ser:userName><ser:newCredential>{pwd}</ser:newCredential>")
            current = admin.returns("getRoleListOfUser", f"<ser:userName>{user}</ser:userName>")
            stale = [r for r in current if r in ROLES and r not in roles]
            missing = [r for r in roles if r not in current]
            if missing or stale:
                body = f"<ser:userName>{user}</ser:userName>"
                body += "".join(f"<ser:deletedRoles>{r}</ser:deletedRoles>" for r in stale)
                body += "".join(f"<ser:newRoles>{r}</ser:newRoles>" for r in missing)
                admin.call("updateRoleListOfUser", body)
            info(f"user '{user}' exists: password synced from .env, roles {', '.join(roles)} ensured")
        else:
            admin.call(
                "addUser",
                f"<ser:userName>{user}</ser:userName><ser:credential>{pwd}</ser:credential>"
                + "".join(f"<ser:roleList>{r}</ser:roleList>" for r in roles)
                + "<ser:profileName>default</ser:profileName>"
                "<ser:requirePasswordChange>false</ser:requirePasswordChange>",
            )
            if not admin.exists("isExistingUser", "userName", user):
                raise ApiError(f"user '{user}' was not created (check WSO2's password policy)")
            info(f"user '{user}' created with roles {', '.join(roles)}")


if __name__ == "__main__":
    run()
