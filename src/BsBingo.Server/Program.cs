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
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;
using Servus.Akka;
using BsBingo.Server.Actors;
using BsBingo.Server.Messages;
using BsBingo.Server.Models;
using BsBingo.Server.Services;

var builder = WebApplication.CreateBuilder(args);

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
    .AddGitHub(GitHubAuthenticationDefaults.AuthenticationScheme, options =>
    {
        options.ClientId = builder.Configuration.GetValue<string>("OAuth:GitHub:ClientId") ?? "";
        options.ClientSecret = builder.Configuration.GetValue<string>("OAuth:GitHub:ClientSecret") ?? "";
        options.Scope.Add("user:email");
        options.CallbackPath = "/api/auth/callback/github";
    })
    .AddGoogle(GoogleDefaults.AuthenticationScheme, options =>
    {
        options.ClientId = builder.Configuration.GetValue<string>("OAuth:Google:ClientId") ?? "";
        options.ClientSecret = builder.Configuration.GetValue<string>("OAuth:Google:ClientSecret") ?? "";
        options.CallbackPath = "/api/auth/callback/google";
    });

builder.Services.AddAuthorization();

// Akka.NET with Servus.Akka
builder.Services.AddAkka("bsbingo", configurationBuilder =>
{
    configurationBuilder.WithResolvableActors(helper =>
    {
        helper.Register<GroupActor>();
        helper.Register<GameActor>();
        helper.Register<UserActor>();
    });
});

// Seed data on first startup
builder.Services.AddHostedService<SeedDataService>();

// Health checks
builder.Services.AddHealthChecks();

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

var askTimeout = TimeSpan.FromSeconds(5);

app.MapHealthChecks("/healthz");
app.MapGet("/", () => Results.Redirect("/healthz"));

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
    var principal = context.User;
    if (principal.Identity?.IsAuthenticated != true)
        return Results.Unauthorized();

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
    return Results.Redirect($"/#/auth/callback?token={jwt}");
});

// GET /api/auth/me — return current user info from JWT
app.MapGet("/api/auth/me", (ClaimsPrincipal user) =>
{
    if (user.Identity?.IsAuthenticated != true)
        return Results.Unauthorized();

    return Results.Ok(new
    {
        Id = user.FindFirstValue(JwtRegisteredClaimNames.Sub),
        Name = user.FindFirstValue("name"),
        Email = user.FindFirstValue(JwtRegisteredClaimNames.Email),
        Avatar = user.FindFirstValue("avatar"),
        Provider = user.FindFirstValue("provider")
    });
}).RequireAuthorization();

// GET /api/groups — list all groups (id, name, description, word count)
app.MapGet("/api/groups", async (IRequiredActor<GroupActor> groupActor) =>
{
    var groups = await groupActor.ActorRef.Ask<List<Group>>(new GetAllGroups(), askTimeout);
    return Results.Ok(groups.Select(g => new
    {
        g.Id,
        g.Name,
        g.Description,
        WordCount = g.Words.Count
    }));
});

// GET /api/groups/{id} — group details including all words
app.MapGet("/api/groups/{id}", async (string id, IRequiredActor<GroupActor> groupActor) =>
{
    var group = await groupActor.ActorRef.Ask<Group?>(new GetGroupById(id), askTimeout);
    return group is null ? Results.NotFound() : Results.Ok(group);
});

// POST /api/groups — create a new group
app.MapPost("/api/groups", async (CreateGroupRequest request, IRequiredActor<GroupActor> groupActor) =>
{
    var result = await groupActor.ActorRef.Ask<GroupResult>(
        new CreateGroup(request.Name, request.Description, request.Words), askTimeout);

    if (!result.Success)
        return Results.BadRequest(new { error = result.Error });

    var group = (Group)result.Data!;
    return Results.Created($"/api/groups/{group.Id}", new
    {
        group.Id,
        group.Name,
        group.Description,
        WordCount = group.Words.Count
    });
});

// PUT /api/groups/{id} — update an existing group
app.MapPut("/api/groups/{id}", async (string id, UpdateGroupRequest request, IRequiredActor<GroupActor> groupActor) =>
{
    var result = await groupActor.ActorRef.Ask<GroupResult>(
        new UpdateGroup(id, request.Name, request.Description, request.Words), askTimeout);

    if (!result.Success)
    {
        return result.Error == "Group not found"
            ? Results.NotFound(new { error = result.Error })
            : Results.BadRequest(new { error = result.Error });
    }

    return Results.Ok(result.Data);
});

// DELETE /api/groups/{id} — delete a group
app.MapDelete("/api/groups/{id}", async (string id, IRequiredActor<GroupActor> groupActor) =>
{
    var result = await groupActor.ActorRef.Ask<GroupResult>(
        new DeleteGroup(id), askTimeout);

    if (!result.Success)
        return Results.NotFound(new { error = result.Error });

    return Results.NoContent();
});

// POST /api/game/new?groupId={id} — generate a randomized 25-cell board
app.MapPost("/api/game/new", async (string groupId, IRequiredActor<GameActor> gameActor) =>
{
    var board = await gameActor.ActorRef.Ask<Board?>(new NewGame(groupId), askTimeout);
    return board is null ? Results.NotFound() : Results.Ok(board);
});

app.Run();

// Request DTOs
public sealed record CreateGroupRequest(string Name, string? Description, List<string> Words);
public sealed record UpdateGroupRequest(string Name, string? Description, List<string> Words);
