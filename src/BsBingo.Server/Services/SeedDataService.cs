using BsBingo.Server.Models;

namespace BsBingo.Server.Services;

public sealed class SeedDataService(GroupRepository groups, ILogger<SeedDataService> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var count = await groups.CountAsync();
        if (count > 0)
        {
            logger.LogInformation("Database already contains {Count} group(s), skipping seed", count);
            return;
        }

        logger.LogInformation("No groups found — seeding 'Smart Factory Edition'");

        var group = new Group
        {
            Name = "Smart Factory Edition",
            Description = "The original Bullshit Bingo buzzword collection for your next factory meeting.",
            Words =
            [
                "Smart Factory",
                "Committed",
                "Zukunftsorientiert",
                "Transparency",
                "Industry 4.0",
                "Module",
                "Roadmap",
                "Quick Win",
                "Synergien nutzen",
                "Alignment",
                "Low Hanging Fruit",
                "Proof of Concept",
                "MVP",
                "Skalierbar",
                "Cloud-native",
                "Holistic",
                "KPI",
                "Platform Strategy",
                "Future-proof",
                "IoT",
                "Edge",
                "DevOps",
                "Innovation",
                "Workshop",
                "Das klären wir im nächsten Meeting",
                "Ownership",
                "To be defined",
                "Wir sind noch in der Findungsphase",
                "Ganzheitlich",
                "Nachhaltigkeit",
                "Lean",
                "DSGVO-konform",
                "Prozessoptimierung",
                "Das ist nicht in Scope",
                "P3 Replacement",
                "Digital Twin",
                "Connectivity",
                "Predictive Maintenance",
                "Digital Excellence",
                "Pune"
            ],
            Visibility = "public",
            CreatedBy = null
        };

        await groups.InsertAsync(group);
        logger.LogInformation("Seeded group '{Name}' with {WordCount} words (Id: {Id})", group.Name, group.Words.Count, group.Id);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
