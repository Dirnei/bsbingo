using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace BsBingo.Server.Models;

public sealed class Group
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    public string Name { get; set; } = null!;

    public string? Description { get; set; }

    public List<string> Words { get; set; } = [];

    public string Visibility { get; set; } = "public";

    [BsonRepresentation(BsonType.ObjectId)]
    public string? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public void Validate()
    {
        if (string.IsNullOrWhiteSpace(Name))
            throw new ArgumentException("Group name is required.", nameof(Name));

        if (Words.Count < 24)
            throw new ArgumentException($"Group must have at least 24 words, but has {Words.Count}.", nameof(Words));
    }
}
