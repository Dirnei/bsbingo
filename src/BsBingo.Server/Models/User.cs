using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace BsBingo.Server.Models;

public sealed class User
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = null!;

    public string DisplayName { get; set; } = null!;

    public string Email { get; set; } = null!;

    public string? AvatarUrl { get; set; }

    public List<OAuthProvider> OAuthProviders { get; set; } = [];

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class OAuthProvider
{
    public string Provider { get; set; } = null!;

    public string ProviderId { get; set; } = null!;
}
