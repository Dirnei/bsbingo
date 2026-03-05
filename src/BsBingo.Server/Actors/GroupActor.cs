using Akka.Actor;
using BsBingo.Server.Messages;
using BsBingo.Server.Models;
using BsBingo.Server.Services;

namespace BsBingo.Server.Actors;

public sealed class GroupActor : ReceiveActor
{
    public GroupActor(GroupRepository repository)
    {
        ReceiveAsync<GetAllGroups>(async msg =>
        {
            var groups = await repository.GetAllAsync();
            var filtered = groups.Where(g =>
                g.Visibility == "public" || (msg.UserId is not null && g.CreatedBy == msg.UserId)
            ).ToList();
            Sender.Tell(filtered);
        });

        ReceiveAsync<GetGroupById>(async msg =>
        {
            var group = await repository.GetByIdAsync(msg.Id);
            Sender.Tell(group);
        });

        ReceiveAsync<CreateGroup>(async msg =>
        {
            try
            {
                var group = new Group
                {
                    Name = msg.Name,
                    Description = msg.Description,
                    Words = msg.Words,
                    CreatedBy = msg.UserId,
                    Visibility = msg.Visibility is "public" or "private" ? msg.Visibility : "public"
                };
                await repository.InsertAsync(group);
                Sender.Tell(new GroupResult(true, Data: group));
            }
            catch (ArgumentException ex)
            {
                Sender.Tell(new GroupResult(false, Error: ex.Message));
            }
        });

        ReceiveAsync<UpdateGroup>(async msg =>
        {
            try
            {
                var existing = await repository.GetByIdAsync(msg.Id);
                if (existing is null)
                {
                    Sender.Tell(new GroupResult(false, Error: "Group not found"));
                    return;
                }

                if (existing.CreatedBy is not null && existing.CreatedBy != msg.UserId)
                {
                    Sender.Tell(new GroupResult(false, Error: "Forbidden"));
                    return;
                }

                existing.Name = msg.Name;
                existing.Description = msg.Description;
                existing.Words = msg.Words;
                existing.Visibility = msg.Visibility is "public" or "private" ? msg.Visibility : existing.Visibility;
                await repository.UpdateAsync(existing);
                Sender.Tell(new GroupResult(true, Data: existing));
            }
            catch (ArgumentException ex)
            {
                Sender.Tell(new GroupResult(false, Error: ex.Message));
            }
        });

        ReceiveAsync<DeleteGroup>(async msg =>
        {
            var existing = await repository.GetByIdAsync(msg.Id);
            if (existing is null)
            {
                Sender.Tell(new GroupResult(false, Error: "Group not found"));
                return;
            }

            if (existing.CreatedBy is not null && existing.CreatedBy != msg.UserId)
            {
                Sender.Tell(new GroupResult(false, Error: "Forbidden"));
                return;
            }

            await repository.DeleteAsync(msg.Id);
            Sender.Tell(new GroupResult(true));
        });
    }
}
