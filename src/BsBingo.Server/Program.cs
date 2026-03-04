using Akka.Actor;
using Akka.Hosting;
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

// Akka.NET with Servus.Akka
builder.Services.AddAkka("bsbingo", configurationBuilder =>
{
    configurationBuilder.WithResolvableActors(helper =>
    {
        helper.Register<GroupActor>();
        helper.Register<GameActor>();
    });
});

// Seed data on first startup
builder.Services.AddHostedService<SeedDataService>();

// Health checks
builder.Services.AddHealthChecks();

var app = builder.Build();

var askTimeout = TimeSpan.FromSeconds(5);

app.MapHealthChecks("/healthz");
app.MapGet("/", () => Results.Redirect("/healthz"));

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
