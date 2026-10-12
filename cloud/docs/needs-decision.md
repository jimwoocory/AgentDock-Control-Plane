# Decisions

No open product decision. User authorized private Site and readonly MCP, an alternate connection, and company PC-20251130TKZA. Use service-authenticated snapshot ingress rather than BYOP; private access and a dedicated collector key remain enforced. No public Site, Core change or runtime mutation.

Ruling: owner-private shared dashboard records use Site-level source scope; service credentials authorize only this shared service path, not connected-app consent or an impersonated visitor. Browser mutations require real platform user identity and same-origin requests. MCP is readonly. New MCP installation, if required by the platform, must be reported separately from existing AgentDock authorization.
