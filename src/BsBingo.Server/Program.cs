using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Akka.Actor;
using Akka.Hosting;
using AspNet.Security.OAuth.GitHub;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;
using Servus.Akka;
using BsBingo.Server.Actors;
using BsBingo.Server.Messages;
using BsBingo.Server.Models;
using BsBingo.Server.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo("/data/keys"));

// Load optional local settings (gitignored) for secrets like OAuth credentials
builder.Configuration.AddJsonFile("appsettings.secure.json", optional: true, reloadOnChange: true);

// MongoDB
var mongoConnectionString = builder.Configuration.GetValue<string>("MongoDB:ConnectionString")
    ?? "mongodb://localhost:27017";
var mongoDatabaseName = builder.Configuration.GetValue<string>("MongoDB:Database")
    ?? "bsbingo";

builder.Services.AddSingleton<IMongoClient>(new MongoClient(mongoConnectionString));
builder.Services.AddSingleton(sp => sp.GetRequiredService<IMongoClient>().GetDatabase(mongoDatabaseName));
builder.Services.AddSingleton<GroupRepository>();
builder.Services.AddSingleton<UserRepository>();

// Authentication — OAuth + JWT
var jwtSecret = builder.Configuration.GetValue<string>("Jwt:Secret")
    ?? throw new InvalidOperationException("Jwt:Secret must be configured");
var jwtIssuer = builder.Configuration.GetValue<string>("Jwt:Issuer") ?? "bsbingo";
var jwtAudience = builder.Configuration.GetValue<string>("Jwt:Audience") ?? "bsbingo";
var jwtExpirationDays = builder.Configuration.GetValue<int>("Jwt:ExpirationDays", 7);

builder.Services.AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultSignInScheme = CookieAuthenticationDefaults.AuthenticationScheme;
    })
    .AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, options =>
    {
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.HttpOnly = true;
    })
    .AddJwtBearer(JwtBearerDefaults.AuthenticationScheme, options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
        };
    })
    ;

var githubClientId = builder.Configuration.GetValue<string>("OAuth:GitHub:ClientId");
var githubClientSecret = builder.Configuration.GetValue<string>("OAuth:GitHub:ClientSecret");
if (!string.IsNullOrEmpty(githubClientId) && !string.IsNullOrEmpty(githubClientSecret))
{
    builder.Services.AddAuthentication()
        .AddGitHub(GitHubAuthenticationDefaults.AuthenticationScheme, options =>
        {
            options.ClientId = githubClientId;
            options.ClientSecret = githubClientSecret;
            options.Scope.Add("user:email");
            options.CallbackPath = "/api/auth/callback/github";
        });
}

var googleClientId = builder.Configuration.GetValue<string>("OAuth:Google:ClientId");
var googleClientSecret = builder.Configuration.GetValue<string>("OAuth:Google:ClientSecret");
if (!string.IsNullOrEmpty(googleClientId) && !string.IsNullOrEmpty(googleClientSecret))
{
    builder.Services.AddAuthentication()
        .AddGoogle(GoogleDefaults.AuthenticationScheme, options =>
        {
            options.ClientId = googleClientId;
            options.ClientSecret = googleClientSecret;
            options.CallbackPath = "/api/auth/callback/google";
        });
}

builder.Services.AddAuthorization();

// Akka.NET with Servus.Akka
builder.Services.AddAkka("bsbingo", configurationBuilder =>
{
    configurationBuilder.WithResolvableActors(helper =>
    {
        helper.Register<GroupActor>();
        helper.Register<GameActor>();
        helper.Register<UserActor>();
        helper.Register<LobbyManagerActor>();
    });
});

// Seed data on first startup
builder.Services.AddHostedService<SeedDataService>();

// Health checks
builder.Services.AddHealthChecks();

var app = builder.Build();

app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost,
});

app.UseWebSockets();
app.UseAuthentication();
app.UseAuthorization();

var askTimeout = TimeSpan.FromSeconds(5);

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapHealthChecks("/healthz");

// --- Auth endpoints ---

// Initiate OAuth login for a given provider
app.MapGet("/api/auth/login/{provider}", (string provider) =>
{
    var scheme = provider.ToLowerInvariant() switch
    {
        "github" => GitHubAuthenticationDefaults.AuthenticationScheme,
        "google" => GoogleDefaults.AuthenticationScheme,
        _ => null
    };

    if (scheme is null)
        return Results.BadRequest(new { error = $"Unknown provider: {provider}" });

    return Results.Challenge(
        new AuthenticationProperties { RedirectUri = "/api/auth/token" },
        [scheme]);
});

// After OAuth callback, create/find user in DB, issue a JWT, and redirect to the frontend
app.MapGet("/api/auth/token", async (HttpContext context, IConfiguration config, IRequiredActor<UserActor> userActor) =>
{
    // Authenticate using the cookie scheme (not the default JWT scheme),
    // since the OAuth callback stores the result in a cookie.
    var authResult = await context.AuthenticateAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    if (!authResult.Succeeded)
        return Results.Unauthorized();
    var principal = authResult.Principal;

    var provider = principal.Identity.AuthenticationType ?? "";
    var providerId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var displayName = principal.FindFirstValue(ClaimTypes.Name) ?? "";
    var email = principal.FindFirstValue(ClaimTypes.Email) ?? "";
    var avatarUrl = principal.FindFirstValue("urn:github:avatar")
        ?? principal.FindFirstValue("picture")
        ?? "";

    // Upsert user in MongoDB via UserActor
    var userResult = await userActor.ActorRef.Ask<UserResult>(
        new GetOrCreateUser(provider, providerId, displayName, email, string.IsNullOrEmpty(avatarUrl) ? null : avatarUrl),
        askTimeout);

    if (!userResult.Success || userResult.User is null)
        return Results.Problem("Failed to create or find user.");

    var dbUser = userResult.User;

    var secret = config.GetValue<string>("Jwt:Secret")!;
    var issuer = config.GetValue<string>("Jwt:Issuer") ?? "bsbingo";
    var audience = config.GetValue<string>("Jwt:Audience") ?? "bsbingo";
    var expirationDays = config.GetValue<int>("Jwt:ExpirationDays", 7);

    var claims = new List<Claim>
    {
        new(JwtRegisteredClaimNames.Sub, dbUser.Id),
        new(JwtRegisteredClaimNames.Email, dbUser.Email),
        new("name", dbUser.DisplayName),
        new("avatar", dbUser.AvatarUrl ?? ""),
        new("provider", provider)
    };

    var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
    var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

    var token = new JwtSecurityToken(
        issuer: issuer,
        audience: audience,
        claims: claims,
        expires: DateTime.UtcNow.AddDays(expirationDays),
        signingCredentials: creds);

    var jwt = new JwtSecurityTokenHandler().WriteToken(token);

    // Redirect to frontend with token as query parameter
    var redirectUrl = $"/#/auth/callback?token={jwt}";
    return Results.Redirect(redirectUrl);
});

// GET /api/auth/me — return current user info from JWT
app.MapGet("/api/auth/me", (ClaimsPrincipal user) =>
{
    if (user.Identity?.IsAuthenticated != true)
        return Results.Unauthorized();

    return Results.Ok(new
    {
        Id = user.FindFirstValue(ClaimTypes.NameIdentifier),
        Name = user.FindFirstValue("name"),
        Email = user.FindFirstValue(ClaimTypes.Email),
        Avatar = user.FindFirstValue("avatar"),
        Provider = user.FindFirstValue("provider")
    });
}).RequireAuthorization();

// GET /api/groups — list all groups (id, name, description, word count, createdBy, visibility)
app.MapGet("/api/groups", async (ClaimsPrincipal user, IRequiredActor<GroupActor> groupActor, UserRepository userRepository) =>
{
    var userId = user.Identity?.IsAuthenticated == true
        ? user.FindFirstValue(ClaimTypes.NameIdentifier)
        : null;
    var groups = await groupActor.ActorRef.Ask<List<Group>>(new GetAllGroups(userId), askTimeout);

    // Resolve owner display names
    var ownerIds = groups.Select(g => g.CreatedBy).Where(id => id is not null).Distinct().ToList();
    var ownerNames = new Dictionary<string, string>();
    foreach (var ownerId in ownerIds)
    {
        var owner = await userRepository.GetByIdAsync(ownerId!);
        if (owner is not null)
            ownerNames[ownerId!] = owner.DisplayName;
    }

    return Results.Ok(groups.Select(g => new
    {
        g.Id,
        g.Name,
        g.Description,
        WordCount = g.Words.Count,
        g.CreatedBy,
        CreatedByName = g.CreatedBy is not null && ownerNames.TryGetValue(g.CreatedBy, out var name) ? name : null,
        g.Visibility,
        InviteToken = (userId is not null && g.CreatedBy == userId) ? g.InviteToken : null,
        SharedWith = (userId is not null && g.CreatedBy == userId) ? g.SharedWith : null,
        StarCount = g.StarredBy.Count,
        IsStarred = userId is not null && g.StarredBy.Contains(userId)
    }));
});

// GET /api/groups/{id} — group details including all words
app.MapGet("/api/groups/{id}", async (string id, IRequiredActor<GroupActor> groupActor) =>
{
    var group = await groupActor.ActorRef.Ask<Group?>(new GetGroupById(id), askTimeout);
    return group is null ? Results.NotFound() : Results.Ok(group);
});

// POST /api/groups — create a new group
app.MapPost("/api/groups", async (CreateGroupRequest request, ClaimsPrincipal user, IRequiredActor<GroupActor> groupActor) =>
{
    var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
    var result = await groupActor.ActorRef.Ask<GroupResult>(
        new CreateGroup(request.Name, request.Description, request.Words, userId, request.Visibility ?? "public"), askTimeout);

    if (!result.Success)
        return Results.BadRequest(new { error = result.Error });

    var group = (Group)result.Data!;
    return Results.Created($"/api/groups/{group.Id}", new
    {
        group.Id,
        group.Name,
        group.Description,
        WordCount = group.Words.Count,
        group.CreatedBy,
        group.Visibility
    });
}).RequireAuthorization();

// PUT /api/groups/{id} — update an existing group
app.MapPut("/api/groups/{id}", async (string id, UpdateGroupRequest request, ClaimsPrincipal user, IRequiredActor<GroupActor> groupActor) =>
{
    var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
    var result = await groupActor.ActorRef.Ask<GroupResult>(
        new UpdateGroup(id, request.Name, request.Description, request.Words, userId, request.Visibility ?? "public"), askTimeout);

    if (!result.Success)
    {
        return result.Error switch
        {
            "Group not found" => Results.NotFound(new { error = result.Error }),
            "Forbidden" => Results.StatusCode(403),
            _ => Results.BadRequest(new { error = result.Error })
        };
    }

    return Results.Ok(result.Data);
}).RequireAuthorization();

// DELETE /api/groups/{id} — delete a group
app.MapDelete("/api/groups/{id}", async (string id, ClaimsPrincipal user, IRequiredActor<GroupActor> groupActor) =>
{
    var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
    var result = await groupActor.ActorRef.Ask<GroupResult>(
        new DeleteGroup(id, userId), askTimeout);

    if (!result.Success)
    {
        return result.Error switch
        {
            "Group not found" => Results.NotFound(new { error = result.Error }),
            "Forbidden" => Results.StatusCode(403),
            _ => Results.BadRequest(new { error = result.Error })
        };
    }

    return Results.NoContent();
}).RequireAuthorization();

// POST /api/groups/{id}/invite — generate an invite link for a private group (owner only)
app.MapPost("/api/groups/{id}/invite", async (string id, ClaimsPrincipal user, IRequiredActor<GroupActor> groupActor) =>
{
    var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
    var result = await groupActor.ActorRef.Ask<GroupResult>(
        new GenerateInviteLink(id, userId!), askTimeout);

    if (!result.Success)
    {
        return result.Error switch
        {
            "Group not found" => Results.NotFound(new { error = result.Error }),
            "Forbidden" => Results.StatusCode(403),
            _ => Results.BadRequest(new { error = result.Error })
        };
    }

    return Results.Ok(new { inviteToken = (string)result.Data! });
}).RequireAuthorization();

// GET /api/invite/{token} — validate an invite token and return group info
app.MapGet("/api/invite/{token}", async (string token, IRequiredActor<GroupActor> groupActor) =>
{
    var group = await groupActor.ActorRef.Ask<Group?>(new GetGroupByInviteToken(token), askTimeout);
    if (group is null)
        return Results.NotFound(new { error = "Invalid invite link" });

    return Results.Ok(new { group.Id, group.Name, group.Description, WordCount = group.Words.Count });
});

// POST /api/invite/{token}/accept — accept an invite and join the group
app.MapPost("/api/invite/{token}/accept", async (string token, ClaimsPrincipal user, IRequiredActor<GroupActor> groupActor) =>
{
    var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
    var result = await groupActor.ActorRef.Ask<GroupResult>(
        new AcceptInvite(token, userId!), askTimeout);

    if (!result.Success)
        return Results.NotFound(new { error = result.Error });

    var group = (Group)result.Data!;
    return Results.Ok(new { group.Id, group.Name });
}).RequireAuthorization();

// GET /api/groups/{id}/shared — list users who have access to a group (owner only)
app.MapGet("/api/groups/{id}/shared", async (string id, ClaimsPrincipal user, IRequiredActor<GroupActor> groupActor) =>
{
    var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
    var result = await groupActor.ActorRef.Ask<GroupResult>(
        new GetSharedUsers(id, userId!), askTimeout);

    if (!result.Success)
    {
        return result.Error switch
        {
            "Group not found" => Results.NotFound(new { error = result.Error }),
            "Forbidden" => Results.StatusCode(403),
            _ => Results.BadRequest(new { error = result.Error })
        };
    }

    return Results.Ok(new { sharedWith = (List<string>)result.Data! });
}).RequireAuthorization();

// POST /api/groups/{id}/star — star a group
app.MapPost("/api/groups/{id}/star", async (string id, ClaimsPrincipal user, IRequiredActor<GroupActor> groupActor) =>
{
    var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
    var result = await groupActor.ActorRef.Ask<GroupResult>(
        new StarGroup(id, userId!), askTimeout);

    if (!result.Success)
    {
        return result.Error switch
        {
            "Group not found" => Results.NotFound(new { error = result.Error }),
            _ => Results.BadRequest(new { error = result.Error })
        };
    }

    return Results.Ok(new { starCount = (int)result.Data! });
}).RequireAuthorization();

// DELETE /api/groups/{id}/star — unstar a group
app.MapDelete("/api/groups/{id}/star", async (string id, ClaimsPrincipal user, IRequiredActor<GroupActor> groupActor) =>
{
    var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
    var result = await groupActor.ActorRef.Ask<GroupResult>(
        new UnstarGroup(id, userId!), askTimeout);

    if (!result.Success)
    {
        return result.Error switch
        {
            "Group not found" => Results.NotFound(new { error = result.Error }),
            _ => Results.BadRequest(new { error = result.Error })
        };
    }

    return Results.Ok(new { starCount = (int)result.Data! });
}).RequireAuthorization();

// POST /api/game/new?groupId={id} — generate a randomized 25-cell board
app.MapPost("/api/game/new", async (string groupId, IRequiredActor<GameActor> gameActor) =>
{
    var board = await gameActor.ActorRef.Ask<Board?>(new NewGame(groupId), askTimeout);
    return board is null ? Results.NotFound() : Results.Ok(board);
});

// --- Lobby endpoints ---

// POST /api/lobbies — create a new multiplayer lobby for a group
app.MapPost("/api/lobbies", async (CreateLobbyRequest request, IRequiredActor<LobbyManagerActor> lobbyManager) =>
{
    var result = await lobbyManager.ActorRef.Ask<object>(
        new CreateLobby(request.GroupId, request.HostDisplayName), askTimeout);

    return result switch
    {
        LobbyCreated created => Results.Ok(new { lobbyCode = created.LobbyCode }),
        LobbyNotFound notFound => Results.BadRequest(new { error = notFound.LobbyCode }),
        _ => Results.Problem("Unexpected response")
    };
});

// --- WebSocket endpoint ---

app.Map("/ws/lobby", async (HttpContext context, IRequiredActor<LobbyManagerActor> lobbyManager) =>
{
    if (!context.WebSockets.IsWebSocketRequest)
        return Results.BadRequest(new { error = "WebSocket connection required" });

    var lobbyCode = context.Request.Query["code"].ToString().ToUpperInvariant();
    if (string.IsNullOrEmpty(lobbyCode))
        return Results.BadRequest(new { error = "Missing 'code' query parameter" });

    // Verify the lobby exists
    var findResult = await lobbyManager.ActorRef.Ask<object>(
        new FindLobby(lobbyCode), askTimeout);

    if (findResult is LobbyNotFound)
    {
        return Results.NotFound(new { error = "Lobby not found" });
    }

    var lobbyFound = (LobbyFound)findResult;
    var webSocket = await context.WebSockets.AcceptWebSocketAsync();
    var playerId = Guid.NewGuid().ToString("N")[..12];

    // Create the PlayerSessionActor
    var actorSystem = context.RequestServices.GetRequiredService<ActorSystem>();
    var sessionActor = actorSystem.ActorOf(
        Props.Create(() => new PlayerSessionActor(webSocket, playerId, lobbyFound.LobbyActorRef)),
        $"player-session-{playerId}");

    // Run the read loop (blocks until the WebSocket closes)
    await PlayerSessionActor.RunReadLoopAsync(webSocket, sessionActor, context.RequestAborted);

    // Clean up
    if (webSocket.State == System.Net.WebSockets.WebSocketState.Open)
    {
        await webSocket.CloseAsync(
            System.Net.WebSockets.WebSocketCloseStatus.NormalClosure,
            "Connection closed",
            CancellationToken.None);
    }

    return Results.Empty;
});

app.MapFallbackToFile("index.html");

app.Run();

// Request DTOs
public sealed record CreateGroupRequest(string Name, string? Description, List<string> Words, string? Visibility = "public");
public sealed record UpdateGroupRequest(string Name, string? Description, List<string> Words, string? Visibility = "public");
public sealed record CreateLobbyRequest(string GroupId, string HostDisplayName);
