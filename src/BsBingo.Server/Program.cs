using Akka.Hosting;
using MongoDB.Driver;
using Servus.Akka;
using BsBingo.Server.Actors;
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

// Health checks
builder.Services.AddHealthChecks();

var app = builder.Build();

app.MapHealthChecks("/healthz");
app.MapGet("/", () => Results.Redirect("/healthz"));

app.Run();
