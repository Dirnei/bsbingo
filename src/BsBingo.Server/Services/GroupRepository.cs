using MongoDB.Driver;
using BsBingo.Server.Models;

namespace BsBingo.Server.Services;

public sealed class GroupRepository
{
    private readonly IMongoCollection<Group> _groups;

    public GroupRepository(IMongoDatabase database)
    {
        _groups = database.GetCollection<Group>("groups");
    }

    public async Task<List<Group>> GetAllAsync()
    {
        return await _groups.Find(_ => true).ToListAsync();
    }

    public async Task<Group?> GetByIdAsync(string id)
    {
        return await _groups.Find(g => g.Id == id).FirstOrDefaultAsync();
    }

    public async Task<long> CountAsync()
    {
        return await _groups.CountDocumentsAsync(_ => true);
    }

    public async Task InsertAsync(Group group)
    {
        group.Validate();
        await _groups.InsertOneAsync(group);
    }

    public async Task<bool> UpdateAsync(Group group)
    {
        group.Validate();
        group.UpdatedAt = DateTime.UtcNow;
        var result = await _groups.ReplaceOneAsync(g => g.Id == group.Id, group);
        return result.MatchedCount > 0;
    }

    public async Task<bool> DeleteAsync(string id)
    {
        var result = await _groups.DeleteOneAsync(g => g.Id == id);
        return result.DeletedCount > 0;
    }
}
