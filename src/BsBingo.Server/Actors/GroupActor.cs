using Akka.Actor;
using BsBingo.Server.Messages;
using BsBingo.Server.Models;
using BsBingo.Server.Services;

namespace BsBingo.Server.Actors;

public sealed class GroupActor : ReceiveActor
{
    public GroupActor(GroupRepository repository)
    {
        ReceiveAsync<GetAllGroups>(async _ =>
        {
            var groups = await repository.GetAllAsync();
            Sender.Tell(groups);
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
                    Words = msg.Words
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

                existing.Name = msg.Name;
                existing.Description = msg.Description;
                existing.Words = msg.Words;
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
            var deleted = await repository.DeleteAsync(msg.Id);
            Sender.Tell(deleted
                ? new GroupResult(true)
                : new GroupResult(false, Error: "Group not found"));
        });
    }
}
